import { Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { loadPublicLaunch } from '../lib/serializers.js';
import { pageArgs, pageResult } from '../lib/pagination.js';

const DAY_MS = 86_400_000;
const RECENT_USER_SIGNAL_DAYS = 30;
const RECENT_AGGREGATE_DAYS = 7;
const textValue = (req, key) => {
  const value = req.query[key];
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new ApiError(422, 'VALIDATION_ERROR', `Invalid ${key}.`, { [key]: 'Use a single text value.' });
  const trimmed = value.trim();
  if (trimmed.length > 80) throw new ApiError(422, 'VALIDATION_ERROR', `${key} is too long.`, { [key]: 'Use 80 characters or fewer.' });
  return trimmed;
};
const normalized = value => String(value ?? '').trim().toLocaleLowerCase('en');
const escapeLike = value => value.replace(/[\\%_]/g, '\\$&');

function userCategoryInterests(db, userId, since, nowMs) {
  if (!userId) return new Map();
  const events = db.prepare(`SELECT COALESCE(l.category, b.category) AS category, e.event_type AS eventType, e.created_at AS createdAt
    FROM engagement_events e
    JOIN launches l ON l.id = e.launch_id
    JOIN brands b ON b.id = l.brand_id
    WHERE e.actor_user_id = ? AND e.event_type IN ('like', 'save') AND e.qualified = 1
      AND e.retracted_at IS NULL AND julianday(e.created_at) >= julianday(?)
      AND COALESCE(l.category, b.category) IS NOT NULL`).all(userId, since);
  const interests = new Map();
  for (const event of events) {
    const ageDays = Math.max(0, (nowMs - Date.parse(event.createdAt)) / DAY_MS);
    const recency = Number.isFinite(ageDays) ? Math.pow(0.5, ageDays / 14) : 0;
    const weight = event.eventType === 'save' ? 3 : 2;
    interests.set(event.category, (interests.get(event.category) ?? 0) + weight * recency);
  }
  return interests;
}

function aggregateRecentEngagement(db, since) {
  const rows = db.prepare(`SELECT launch_id AS launchId,
      SUM(CASE event_type WHEN 'like' THEN 1 WHEN 'save' THEN 2 ELSE 3 END) AS points
    FROM engagement_events
    WHERE event_type IN ('like', 'save', 'click_out') AND qualified = 1 AND retracted_at IS NULL
      AND julianday(created_at) >= julianday(?)
    GROUP BY launch_id`).all(since);
  return new Map(rows.map(row => [row.launchId, row.points]));
}

function reasonFor(row, { requestedCategory, cityPreference, statePreference, followedCategories, interests, aggregatePoints }) {
  if (requestedCategory) return 'Matches your selected category';
  if ((cityPreference && normalized(row.city) === normalized(cityPreference)) ||
      (statePreference && normalized(row.state) === normalized(statePreference))) return 'Near your selected location';
  if (followedCategories.has(row.category)) return 'From a category you follow';
  if ((interests.get(row.category) ?? 0) > 0) return 'Based on your recent likes and saves';
  if (aggregatePoints > 0) return 'Popular this week';
  return 'Recently published';
}

export function createRecommendationsRouter({ db, auth }) {
  const router = Router();
  router.use(auth.optionalAuth);

  router.get('/for-you', (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const requestedCity = textValue(req, 'city');
    const requestedState = textValue(req, 'state');
    const requestedCategory = textValue(req, 'category');
    if (requestedCategory && !db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(requestedCategory)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an available category.', { category: 'Unavailable category.' });
    }

    const profile = req.user?.id
      ? db.prepare('SELECT city, state FROM founder_profiles WHERE user_id = ?').get(req.user.id)
      : null;
    const cityPreference = requestedCity || profile?.city?.trim() || '';
    const statePreference = requestedState || profile?.state?.trim() || '';
    const followedCategories = new Set(req.user?.id
      ? db.prepare(`SELECT f.target_id AS id FROM follows f JOIN categories c ON c.id = f.target_id
          WHERE f.user_id = ? AND f.target_type = 'category' AND c.active = 1`).all(req.user.id).map(row => row.id)
      : []);

    const nowMs = Date.now();
    const recentUserSince = new Date(nowMs - RECENT_USER_SIGNAL_DAYS * DAY_MS).toISOString();
    const recentAggregateSince = new Date(nowMs - RECENT_AGGREGATE_DAYS * DAY_MS).toISOString();
    const interests = userCategoryInterests(db, req.user?.id, recentUserSince, nowMs);
    const aggregateScores = aggregateRecentEngagement(db, recentAggregateSince);
    const personalized = Boolean(cityPreference || statePreference || followedCategories.size || interests.size);

    const where = ["l.status = 'published'", "b.status = 'published'"];
    const values = [];
    for (const [value, column] of [[requestedCity, 'b.city'], [requestedState, 'b.state']]) {
      if (value) {
        where.push(`${column} LIKE ? ESCAPE '\\' COLLATE NOCASE`);
        values.push(`%${escapeLike(value)}%`);
      }
    }
    if (requestedCategory) {
      where.push('COALESCE(l.category, b.category) = ?');
      values.push(requestedCategory);
    }
    if (req.user?.id) {
      where.push('l.owner_user_id != ?');
      values.push(req.user.id);
    }

    const candidates = db.prepare(`SELECT l.id, l.published_at AS publishedAt,
        COALESCE(l.category, b.category) AS category, b.city, b.state
      FROM launches l JOIN brands b ON b.id = l.brand_id
      WHERE ${where.join(' AND ')}`).all(...values);

    const ranked = candidates.map(row => {
      const aggregatePoints = aggregateScores.get(row.id) ?? 0;
      const ageDays = Number.isFinite(Date.parse(row.publishedAt))
        ? Math.max(0, (nowMs - Date.parse(row.publishedAt)) / DAY_MS)
        : Infinity;
      const freshness = Number.isFinite(ageDays) ? Math.max(0, 30 - ageDays) / 30 * 2 : 0;
      const cityMatch = cityPreference && normalized(row.city) === normalized(cityPreference);
      const stateMatch = statePreference && normalized(row.state) === normalized(statePreference);
      const followMatch = followedCategories.has(row.category);
      const interestScore = Math.min(10, interests.get(row.category) ?? 0);
      const personalScore = (cityMatch ? 5 : 0) + (stateMatch ? 2 : 0) + (followMatch ? 6 : 0) + interestScore;
      const score = personalScore + Math.log1p(aggregatePoints) * 1.25 + freshness;
      return { ...row, aggregatePoints, score,
        recommendationReason: reasonFor(row, { requestedCategory, cityPreference, statePreference, followedCategories, interests, aggregatePoints }) };
    });

    ranked.sort((a, b) => {
      if (personalized && b.score !== a.score) return b.score - a.score;
      return b.aggregatePoints - a.aggregatePoints ||
        String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')) ||
        a.id.localeCompare(b.id);
    });

    const pageRows = ranked.slice(offset, offset + limit + 1).map(row => ({
      ...loadPublicLaunch(db, row.id, req.user),
      recommendationReason: row.recommendationReason
    }));
    const result = pageResult(pageRows, limit, offset);
    const coldStart = !personalized;
    res.set('Cache-Control', 'private, no-store');
    return res.json({ ...result, coldStart, rankingMode: coldStart ? 'popular_recent' : 'personalized' });
  });

  return router;
}
