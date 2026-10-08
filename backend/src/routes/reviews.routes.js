import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { makeLimiter } from '../lib/rate-limit.js';
import { notify, dailyDedupe } from '../lib/notifications.js';

const now = () => new Date().toISOString();
const dimensions = ['overallRating', 'qualityRating', 'valueRating', 'experienceRating'];

function brandIdFor(db, value) {
  return db.prepare("SELECT id, owner_user_id FROM brands WHERE (id = ? OR slug = ?) AND status = 'published'").get(value, value);
}

function publicSummary(db, brandId, viewerId) {
  const aggregate = db.prepare(`SELECT COUNT(*) AS count, AVG(overall_rating) AS overall, AVG(quality_rating) AS quality,
    AVG(value_rating) AS value, AVG(experience_rating) AS experience, AVG(would_recommend) AS recommend
    FROM business_reviews WHERE brand_id = ? AND status = 'published'`).get(brandId);
  const items = db.prepare(`SELECT r.id, r.overall_rating AS overallRating, r.quality_rating AS qualityRating,
    r.value_rating AS valueRating, r.experience_rating AS experienceRating, r.would_recommend AS wouldRecommend,
    r.created_at AS createdAt FROM business_reviews r WHERE r.brand_id = ? AND r.status = 'published'
    ORDER BY r.created_at DESC LIMIT 50`).all(brandId);
  const own = viewerId ? db.prepare(`SELECT id, overall_rating AS overallRating, quality_rating AS qualityRating,
    value_rating AS valueRating, experience_rating AS experienceRating, would_recommend AS wouldRecommend, status
    FROM business_reviews WHERE brand_id = ? AND reviewer_user_id = ?`).get(brandId, viewerId) : null;
  return { count: aggregate.count, average: aggregate.count ? Number(aggregate.overall.toFixed(1)) : null,
    averages: aggregate.count ? { overall: Number(aggregate.overall.toFixed(1)), quality: Number(aggregate.quality.toFixed(1)),
      value: Number(aggregate.value.toFixed(1)), experience: Number(aggregate.experience.toFixed(1)), recommendRate: Math.round(aggregate.recommend * 100) } : null,
    items: items.map(item => ({ ...item, wouldRecommend: Boolean(item.wouldRecommend), reviewerName: 'Verified member' })), ownReview: own ?? null };
}

export function createReviewsRouter({ db, auth }) {
  const router = Router();
  router.use(auth.optionalAuth);
  const submitLimit = makeLimiter({ windowMs: 60_000, limit: 6, message: 'Too many review actions. Please wait before trying again.' });

  router.get('/brands/:idOrSlug/reviews', (req, res) => {
    const brand = brandIdFor(db, req.params.idOrSlug);
    if (!brand) throw new ApiError(404, 'NOT_FOUND', 'This business is unavailable.');
    return res.json({ item: publicSummary(db, brand.id, req.user?.id) });
  });

  router.post('/brands/:idOrSlug/reviews', auth.requireVerified, submitLimit, (req, res) => {
    const brand = brandIdFor(db, req.params.idOrSlug);
    if (!brand) throw new ApiError(404, 'NOT_FOUND', 'This business is unavailable.');
    if (brand.owner_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'Business owners cannot review their own business.');
    const body = req.body?.review ?? {};
    const fields = {};
    for (const field of dimensions) if (!Number.isInteger(body[field]) || body[field] < 1 || body[field] > 5) fields[field] = 'Choose a whole-star rating from 1 to 5.';
    if (typeof body.wouldRecommend !== 'boolean') fields.wouldRecommend = 'Choose yes or no.';
    if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Complete the structured ratings.', fields);
    const existing = db.prepare('SELECT id FROM business_reviews WHERE brand_id = ? AND reviewer_user_id = ?').get(brand.id, req.user.id);
    const id = existing?.id ?? randomUUID(), time = now();
    db.prepare(`INSERT INTO business_reviews(id, brand_id, reviewer_user_id, overall_rating, quality_rating, value_rating,
      experience_rating, would_recommend, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
      ON CONFLICT(brand_id, reviewer_user_id) DO UPDATE SET overall_rating = excluded.overall_rating,
      quality_rating = excluded.quality_rating, value_rating = excluded.value_rating, experience_rating = excluded.experience_rating,
      would_recommend = excluded.would_recommend, status = 'published', updated_at = excluded.updated_at`)
      .run(id, brand.id, req.user.id, body.overallRating, body.qualityRating, body.valueRating, body.experienceRating, Number(body.wouldRecommend), time, time);
    notify(db, brand.owner_user_id, 'review', 'Your business received a rating', 'A verified member submitted structured feedback for your business.', dailyDedupe('review', brand.id));
    return res.status(existing ? 200 : 201).json({ item: publicSummary(db, brand.id, req.user.id) });
  });

  router.delete('/brands/:idOrSlug/reviews/mine', auth.requireAuth, submitLimit, (req, res) => {
    const brand = brandIdFor(db, req.params.idOrSlug);
    if (brand) db.prepare('DELETE FROM business_reviews WHERE brand_id = ? AND reviewer_user_id = ?').run(brand.id, req.user.id);
    return res.status(204).end();
  });

  router.post('/reviews/:id/report', auth.requireVerified, submitLimit, (req, res) => {
    const review = db.prepare("SELECT id, reviewer_user_id FROM business_reviews WHERE id = ? AND status = 'published'").get(req.params.id);
    if (!review) throw new ApiError(404, 'NOT_FOUND', 'This review is unavailable.');
    if (review.reviewer_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot report your own review.');
    const reason = req.body?.reason;
    if (!['misleading', 'conflict_of_interest', 'abuse', 'other'].includes(reason)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a report reason.', { reason: 'Select a listed reason.' });
    db.prepare('INSERT OR IGNORE INTO business_review_reports(id, review_id, reporter_user_id, reason, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), review.id, req.user.id, reason, now());
    return res.status(202).json({ accepted: true });
  });

  router.get('/admin/reviews/reports', auth.requireModerator, (req, res) => {
    const items = db.prepare(`SELECT rr.id, rr.reason, rr.created_at AS createdAt, r.id AS reviewId, r.brand_id AS brandId,
      r.overall_rating AS rating FROM business_review_reports rr JOIN business_reviews r ON r.id = rr.review_id
      WHERE rr.status = 'open' ORDER BY rr.created_at ASC LIMIT 100`).all();
    return res.json({ items });
  });

  router.post('/admin/reviews/:id/actions', auth.requireModerator, (req, res) => {
    const action = req.body?.action;
    if (!['hide', 'restore'].includes(action)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose hide or restore.', { action: 'Use hide or restore.' });
    const review = db.prepare('SELECT id FROM business_reviews WHERE id = ?').get(req.params.id);
    if (!review) throw new ApiError(404, 'NOT_FOUND', 'Review not found.');
    db.prepare('UPDATE business_reviews SET status = ?, updated_at = ? WHERE id = ?').run(action === 'hide' ? 'hidden' : 'published', now(), review.id);
    db.prepare("UPDATE business_review_reports SET status = ? WHERE review_id = ? AND status = 'open'").run(action === 'hide' ? 'actioned' : 'dismissed', review.id);
    return res.json({ action, reviewId: review.id });
  });

  return router;
}
