import { Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { loadPublicLaunch } from '../lib/serializers.js';
import { localDay, periodBounds } from '../lib/time.js';
import { pageArgs, pageResult } from '../lib/pagination.js';
import { notify, dailyDedupe } from '../lib/notifications.js';
import { addEvent } from '../lib/events.js';

const IST = '+05:30';
const rad = degrees => degrees * Math.PI / 180;
function distanceKm(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function parseCoord(value, min, max, name) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new ApiError(422, 'VALIDATION_ERROR', `Invalid ${name}.`, { [name]: 'Use a valid coordinate.' });
  return number;
}
function openNow(hoursText, date = new Date()) {
  let schedule;
  try { schedule = JSON.parse(hoursText || '{}'); } catch { return null; }
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(date).toLowerCase();
  const minutes = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).replace(':', ''));
  const slot = schedule[weekday];
  if (!slot || slot === 'closed') return false;
  if (typeof slot.open !== 'string' || typeof slot.close !== 'string') return null;
  const parse = value => /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
  const start = parse(slot.open), end = parse(slot.close), current = Math.floor(minutes / 100) * 60 + minutes % 100;
  return start !== null && end !== null && current >= start && current < end;
}
function lifecycle(db, launch) {
  const now = new Date();
  const launchAt = launch.launch_at ? new Date(launch.launch_at) : launch.launch_date ? new Date(`${launch.launch_date}T00:00:00${IST}`) : launch.published_at ? new Date(launch.published_at) : now;
  const launchDay = localDay(launchAt), today = localDay(now);
  if (launchDay > today) return 'coming_soon';
  if (launchDay === today) return 'launching_today';
  const score = db.prepare(`SELECT (SELECT COUNT(*) FROM engagement_events WHERE launch_id = ? AND event_type = 'like' AND qualified = 1 AND retracted_at IS NULL AND created_at >= datetime('now', '-7 days')) +
    2 * (SELECT COUNT(*) FROM engagement_events WHERE launch_id = ? AND event_type = 'save' AND qualified = 1 AND retracted_at IS NULL AND created_at >= datetime('now', '-7 days')) AS n`).get(launch.id, launch.id).n;
  const ageDays = (now - launchAt) / 86_400_000;
  if (ageDays >= 90) return 'established';
  const eligible = db.prepare("SELECT COUNT(*) AS n FROM launches WHERE status = 'published'").get().n;
  const trendingCount = db.prepare(`SELECT COUNT(*) AS n FROM launches l WHERE l.status = 'published' AND
    ((SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'like' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= datetime('now', '-7 days')) +
     2 * (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'save' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= datetime('now', '-7 days'))) >= 3`).get().n;
  if (score >= 3 && (eligible < 5 || trendingCount <= Math.max(1, Math.floor(eligible * 0.2)))) return 'trending';
  return 'live';
}
function businessPayload(db, row, viewerId) {
  const openingStatus = openNow(row.opening_hours);
  const count = db.prepare("SELECT COUNT(*) AS n FROM launches WHERE brand_id = ? AND status = 'published'").get(row.id).n;
  return { id: row.id, slug: row.slug, name: row.name, description: row.description, tagline: row.tagline, category: row.category,
    city: row.city, state: row.state, area: row.area, address: row.address, latitude: row.latitude, longitude: row.longitude,
    distanceKm: row.distanceKm ?? undefined, businessMode: row.business_mode, openNow: openingStatus,
    verified: Boolean(row.owner_verified), // email verification of the managing account; not a business verification badge
    openingHours: JSON.parse(row.opening_hours || '{}'), launchCount: count,
    saveCount: db.prepare('SELECT COUNT(*) AS n FROM business_saves WHERE brand_id = ?').get(row.id).n,
    isFollowed: viewerId ? Boolean(db.prepare("SELECT 1 FROM follows WHERE user_id = ? AND target_type = 'brand' AND target_id = ?").get(viewerId, row.id)) : false,
    isSaved: viewerId ? Boolean(db.prepare('SELECT 1 FROM business_saves WHERE user_id = ? AND brand_id = ?').get(viewerId, row.id)) : false,
    links: { website: row.website_url ?? undefined, instagram: row.instagram_url ?? undefined,
      whatsapp: row.whatsapp_url ?? undefined, phone: row.contact_phone ?? undefined, email: row.contact_email ?? undefined,
      quote: row.quote_url ?? undefined, demo: row.demo_url ?? undefined, store: row.store_url ?? undefined } };
}

export function createDiscoveryRouter({ db, auth, config }) {
  const router = Router();
  router.use(auth.optionalAuth);

  router.get('/discover/businesses', (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const where = ["b.status = 'published'"];
    const values = [];
    const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 120) : '';
    if (query) { where.push('(b.name LIKE ? COLLATE NOCASE OR b.description LIKE ? COLLATE NOCASE OR b.city LIKE ? COLLATE NOCASE OR b.area LIKE ? COLLATE NOCASE)'); const pattern = `%${query}%`; values.push(pattern, pattern, pattern, pattern); }
    if (req.query.city) { where.push('b.city LIKE ? COLLATE NOCASE'); values.push(`%${String(req.query.city).slice(0, 80)}%`); }
    if (req.query.area) { where.push('b.area LIKE ? COLLATE NOCASE'); values.push(`%${String(req.query.area).slice(0, 80)}%`); }
    if (req.query.category) { if (!db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(req.query.category)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an available category.', { category: 'Unavailable category.' }); where.push('b.category = ?'); values.push(req.query.category); }
    if (req.query.mode) { if (!['online', 'physical', 'hybrid'].includes(req.query.mode)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose online, physical, or hybrid.', { mode: 'Unsupported mode.' }); where.push('b.business_mode = ?'); values.push(req.query.mode); }
    if (req.query.verified === 'true') where.push('EXISTS (SELECT 1 FROM users u WHERE u.id = b.owner_user_id AND u.email_verified_at IS NOT NULL)');
    if (req.query.verified === 'false') where.push('NOT EXISTS (SELECT 1 FROM users u WHERE u.id = b.owner_user_id AND u.email_verified_at IS NOT NULL)');
    if (req.query.verified !== undefined && !['true', 'false'].includes(String(req.query.verified))) throw new ApiError(422, 'VALIDATION_ERROR', 'verified must be true or false.', { verified: 'Use true or false.' });
    if (req.query.newlyLaunched === 'true') where.push("EXISTS (SELECT 1 FROM launches l WHERE l.brand_id = b.id AND l.status = 'published' AND l.published_at >= datetime('now', '-30 days'))");
    const priceMin = req.query.priceMin === undefined ? undefined : Number(req.query.priceMin);
    const priceMax = req.query.priceMax === undefined ? undefined : Number(req.query.priceMax);
    for (const [field, val] of [['priceMin', priceMin], ['priceMax', priceMax]]) if (val !== undefined && (!Number.isInteger(val) || val < 0)) throw new ApiError(422, 'VALIDATION_ERROR', `${field} must be non-negative integer INR paise.`, { [field]: 'Use INR paise.' });
    if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) throw new ApiError(422, 'VALIDATION_ERROR', 'priceMin must not exceed priceMax.', { priceMin: 'Use an ordered price range.' });
    if (priceMin !== undefined || priceMax !== undefined) { const priceWhere = []; if (priceMin !== undefined) { priceWhere.push('p.price_inr_paise >= ?'); values.push(priceMin); } if (priceMax !== undefined) { priceWhere.push('p.price_inr_paise <= ?'); values.push(priceMax); } where.push(`EXISTS (SELECT 1 FROM products p WHERE p.brand_id = b.id AND p.price_inr_paise IS NOT NULL AND ${priceWhere.join(' AND ')})`); }
    if (req.query.openNow === 'true') where.push("b.opening_hours != '{}' AND b.opening_hours IS NOT NULL");
    if (req.query.openNow !== undefined && !['true', 'false'].includes(String(req.query.openNow))) throw new ApiError(422, 'VALIDATION_ERROR', 'openNow must be true or false.', { openNow: 'Use true or false.' });

    const latitude = parseCoord(req.query.latitude, -90, 90, 'latitude');
    const longitude = parseCoord(req.query.longitude, -180, 180, 'longitude');
    const radiusKm = req.query.radiusKm === undefined ? 25 : Number(req.query.radiusKm);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 500) throw new ApiError(422, 'VALIDATION_ERROR', 'radiusKm must be between 0 and 500.', { radiusKm: 'Choose a radius under 500 km.' });
    if ((latitude === undefined) !== (longitude === undefined)) throw new ApiError(422, 'VALIDATION_ERROR', 'Provide both coordinates for nearby search.', { latitude: 'Latitude and longitude are both required.' });

    const rows = db.prepare(`SELECT b.*, EXISTS (SELECT 1 FROM users u WHERE u.id = b.owner_user_id AND u.email_verified_at IS NOT NULL) AS owner_verified
      FROM brands b WHERE ${where.join(' AND ')} ORDER BY b.name COLLATE NOCASE LIMIT 500`).all(...values);
    let items = rows.map(row => ({ ...row, distanceKm: latitude !== undefined && row.latitude !== null && row.longitude !== null ? distanceKm(latitude, longitude, row.latitude, row.longitude) : undefined }))
      .filter(row => latitude === undefined || (row.distanceKm !== undefined && row.distanceKm <= radiusKm))
      .filter(row => req.query.openNow !== 'true' || openNow(row.opening_hours) === true);
    const sort = req.query.sort ?? (latitude !== undefined ? 'nearby' : 'new');
    if (!['nearby', 'new', 'trending', 'most_saved', 'most_liked', 'rising'].includes(sort)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a supported business sort.', { sort: 'Unsupported sort.' });
    if (sort === 'nearby') items.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    else if (sort === 'new') items.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name));
    else {
      const scores = sort === 'most_saved' || sort === 'most_liked'
        ? new Map(db.prepare(`SELECT b.id, ${sort === 'most_saved' ? '(SELECT COUNT(*) FROM business_saves bs WHERE bs.brand_id = b.id) +' : ''} (SELECT COUNT(*) FROM engagement_events e JOIN launches l ON l.id = e.launch_id
            WHERE l.brand_id = b.id AND l.status = 'published' AND e.event_type = ? AND e.qualified = 1 AND e.retracted_at IS NULL) AS score
            FROM brands b WHERE b.status = 'published'`).all(sort === 'most_saved' ? 'save' : 'like').map(row => [row.id, row.score]))
        : (() => {
          const start = new Date(Date.now() - (sort === 'rising' ? 24 : 168) * 3_600_000).toISOString();
          const query = sort === 'trending' ? `SELECT b.id,
            (SELECT COUNT(*) FROM business_events be WHERE be.brand_id = b.id AND be.created_at >= ?) +
            (SELECT COUNT(*) FROM engagement_events e WHERE e.brand_id = b.id AND e.event_type = 'like' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ?) +
            2 * (SELECT COUNT(*) FROM engagement_events e WHERE e.brand_id = b.id AND e.event_type = 'save' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ?) +
            3 * (SELECT COUNT(*) FROM engagement_events e WHERE e.brand_id = b.id AND e.event_type = 'click_out' AND e.qualified = 1 AND e.created_at >= ?) AS score
            FROM brands b WHERE b.status = 'published'` : `SELECT b.id,
            (SELECT COUNT(*) FROM business_events be WHERE be.brand_id = b.id AND be.created_at >= ?) +
            (SELECT COUNT(*) FROM engagement_events e WHERE e.brand_id = b.id AND e.event_type IN ('like', 'save', 'click_out') AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ?) AS score
            FROM brands b WHERE b.status = 'published'`;
          const rows = sort === 'trending' ? db.prepare(query).all(start, start, start, start) : db.prepare(query).all(start, start);
          return new Map(rows.map(row => [row.id, row.score]));
        })();
      items.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.name.localeCompare(b.name));
    }
    return res.json(pageResult(items.slice(offset, offset + limit + 1).map(row => businessPayload(db, row, req.user?.id)), limit, offset));
  });

  router.get('/launches/upcoming', (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const nowAt = new Date();
    const rows = db.prepare(`SELECT l.id, l.launch_at, l.launch_date FROM launches l JOIN brands b ON b.id = l.brand_id
      WHERE l.status = 'published' AND b.status = 'published' AND
      ((l.launch_at IS NOT NULL AND julianday(l.launch_at) > julianday(?)) OR (l.launch_at IS NULL AND l.launch_date > ?))
      ORDER BY COALESCE(julianday(l.launch_at), julianday(l.launch_date || 'T00:00:00+05:30')) LIMIT ? OFFSET ?`)
      .all(nowAt.toISOString(), localDay(nowAt), limit + 1, offset);
    if (!config.previewReadOnly) for (const item of rows.slice(0, limit)) addEvent(db, req, req.user, db.prepare('SELECT id, brand_id, owner_user_id FROM launches WHERE id = ?').get(item.id), config, 'impression', { dedupeMinutes: 30, source: 'search' });
    return res.json(pageResult(rows.map(row => ({ ...loadPublicLaunch(db, row.id, req.user), lifecycleStage: 'coming_soon', launchAt: row.launch_at ?? row.launch_date, countdownSeconds: row.launch_at ? Math.max(0, Math.floor((new Date(row.launch_at) - Date.now()) / 1000)) : 0 })), limit, offset));
  });

  router.get('/launches/anniversaries', (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const day = localDay();
    const rows = db.prepare(`SELECT l.id, l.launch_date, l.published_at FROM launches l JOIN brands b ON b.id = l.brand_id
      WHERE l.status = 'published' AND b.status = 'published' AND l.launch_date IS NOT NULL
      AND substr(l.launch_date, 6, 5) = substr(?, 6, 5) ORDER BY l.published_at DESC LIMIT ? OFFSET ?`).all(day, limit + 1, offset);
    if (!config.previewReadOnly) for (const item of rows.slice(0, limit)) addEvent(db, req, req.user, db.prepare('SELECT id, brand_id, owner_user_id FROM launches WHERE id = ?').get(item.id), config, 'impression', { dedupeMinutes: 30, source: 'search' });
    return res.json(pageResult(rows.map(row => ({ ...loadPublicLaunch(db, row.id, req.user), anniversaryDate: row.launch_date })), limit, offset));
  });

  router.get('/trending', (req, res) => {
    const period = req.query.period ?? 'today';
    if (!['today', 'week', 'month', 'rising'].includes(period)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose today, week, month, or rising.', { period: 'Unsupported period.' });
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(422, 'VALIDATION_ERROR', 'limit must be an integer from 1 to 100.', { limit: 'Use a value from 1 to 100.' });
    if (!Number.isInteger(offset) || offset < 0) throw new ApiError(422, 'VALIDATION_ERROR', 'offset must be a non-negative integer.', { offset: 'Use zero or a positive integer.' });
    const bounds = period === 'month' ? periodBounds('monthly') : period === 'week' ? periodBounds('weekly') : { start: period === 'today' ? `${localDay()}T00:00:00${IST}` : new Date(Date.now() - 24 * 3_600_000).toISOString(), end: new Date().toISOString() };
    const rows = db.prepare(`SELECT l.id, l.published_at, l.owner_user_id, l.brand_id,
      (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'like' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ? AND e.created_at < ?) +
      2 * (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'save' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ? AND e.created_at < ?) +
      3 * (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'click_out' AND e.qualified = 1 AND e.created_at >= ? AND e.created_at < ?) AS score
      FROM launches l JOIN brands b ON b.id = l.brand_id WHERE l.status = 'published' AND b.status = 'published'
      AND l.leaderboard_opt_out = 0 ORDER BY score DESC, l.published_at DESC, l.id ASC LIMIT ? OFFSET ?`)
      .all(bounds.start, bounds.end, bounds.start, bounds.end, bounds.start, bounds.end, limit + 1, offset);
    const items = rows.slice(0, limit).map((row, index) => {
      const stage = lifecycle(db, { ...row, published_at: row.published_at });
      if (!config.previewReadOnly) addEvent(db, req, req.user, row, config, 'impression', { dedupeMinutes: 30, source: 'trending' });
      if (!config.previewReadOnly && row.score >= 3) notify(db, row.owner_user_id, 'trending', 'Your launch is trending', 'Your launch is gaining attention in the community.', dailyDedupe('trending', row.id));
      return { rank: offset + index + 1, score: row.score, lifecycleStage: stage, launch: loadPublicLaunch(db, row.id, req.user) };
    });
    const rising = period === 'rising' ? db.prepare('SELECT COUNT(*) AS n FROM business_events WHERE created_at >= ? AND created_at < ?').get(bounds.start, bounds.end).n : undefined;
    return res.json({ period, timezone: 'Asia/Kolkata', items, risingBusinessEventCount: period === 'rising' ? rising : undefined });
  });

  router.get('/launches/:idOrSlug/lifecycle', (req, res) => {
    const row = db.prepare(`SELECT l.* FROM launches l JOIN brands b ON b.id = l.brand_id WHERE (l.id = ? OR l.slug = ?) AND l.status = 'published' AND b.status = 'published'`).get(req.params.idOrSlug, req.params.idOrSlug);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'This launch is unavailable.');
    const stage = lifecycle(db, row);
    const alert = req.user ? Boolean(db.prepare('SELECT 1 FROM launch_alert_subscriptions WHERE user_id = ? AND launch_id = ?').get(req.user.id, row.id)) : false;
    return res.json({ lifecycleStage: stage, launchAt: row.launch_at ?? row.launch_date ?? row.published_at, timezone: 'Asia/Kolkata',
      countdownSeconds: row.launch_at && new Date(row.launch_at) > new Date() ? Math.floor((new Date(row.launch_at) - Date.now()) / 1000) : 0,
      notified: alert, rules: { comingSoon: 'scheduled time is in the future', launchingToday: 'launch date is today in Asia/Kolkata',
        trending: 'at least 3 qualified like/save points in 7 days and in the top 20% of active launches (or fewer than 5 active launches)', established: '90 days after launch', live: 'published and none of the above' } });
  });

  router.put('/launches/:idOrSlug/notify', auth.requireAuth, (req, res) => {
    const row = db.prepare(`SELECT l.id, l.brand_id, l.owner_user_id, l.launch_at, l.launch_date FROM launches l JOIN brands b ON b.id = l.brand_id
      WHERE (l.id = ? OR l.slug = ?) AND l.status = 'published' AND b.status = 'published'`).get(req.params.idOrSlug, req.params.idOrSlug);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'This launch is unavailable.');
    if (row.owner_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'Owners cannot subscribe to their own launch alert.');
    if ((row.launch_at && new Date(row.launch_at) <= new Date()) || (!row.launch_at && row.launch_date && row.launch_date < localDay())) throw new ApiError(409, 'CONFLICT', 'This launch time has already passed.');
    db.prepare('INSERT OR IGNORE INTO launch_alert_subscriptions(user_id, launch_id, created_at) VALUES (?, ?, ?)').run(req.user.id, row.id, new Date().toISOString());
    return res.json({ notified: true });
  });

  router.delete('/launches/:idOrSlug/notify', auth.requireAuth, (req, res) => {
    db.prepare(`DELETE FROM launch_alert_subscriptions WHERE user_id = ? AND launch_id = (SELECT id FROM launches WHERE id = ? OR slug = ?)`)
      .run(req.user.id, req.params.idOrSlug, req.params.idOrSlug);
    return res.json({ notified: false });
  });

  return router;
}
