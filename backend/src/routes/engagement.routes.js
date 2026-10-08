import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { makeLimiter } from '../lib/rate-limit.js';
import { actorKey } from '../lib/security.js';
import { localDay } from '../lib/time.js';
import { pageArgs, pageResult } from '../lib/pagination.js';
import { loadPublicLaunch } from '../lib/serializers.js';
import { notify, dailyDedupe } from '../lib/notifications.js';
import { addBusinessEvent } from '../lib/business-events.js';

function getPublicLaunch(db, idOrSlug) {
  const row = db.prepare(`SELECT l.id, l.brand_id, l.owner_user_id FROM launches l JOIN brands b ON b.id = l.brand_id
    WHERE (l.id = ? OR l.slug = ?) AND l.status = 'published' AND b.status = 'published'`).get(idOrSlug, idOrSlug);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'This launch is unavailable.');
  return row;
}

export function createEngagementRouter({ db, auth, config }) {
  const router = Router();
  const limit = makeLimiter({ windowMs: 60_000, limit: 60, message: 'Too many engagement requests. Please wait and try again.' });

  router.put('/launches/:idOrSlug/like', auth.requireVerified, limit, (req, res) => {
    const launch = getPublicLaunch(db, req.params.idOrSlug);
    if (launch.owner_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot support your own launch.');
    const createdAt = new Date().toISOString();
    const result = db.prepare('INSERT OR IGNORE INTO likes(user_id, launch_id, created_at) VALUES (?, ?, ?)').run(req.user.id, launch.id, createdAt);
    if (result.changes) db.prepare(`INSERT INTO engagement_events(id, event_type, launch_id, brand_id, actor_user_id, actor_key, local_day, qualified, created_at)
      VALUES (?, 'like', ?, ?, ?, ?, ?, 1, ?)`)
      .run(randomUUID(), launch.id, launch.brand_id, req.user.id, actorKey(req, req.user.id, config.analyticsSalt), localDay(), createdAt);
    if (result.changes) notify(db, launch.owner_user_id, 'like', 'Someone liked your launch', 'A member liked one of your published launches.', dailyDedupe('like', launch.id));
    const likeCount = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE launch_id = ?').get(launch.id).n;
    return res.json({ liked: true, likeCount });
  });

  router.delete('/launches/:idOrSlug/like', auth.requireVerified, limit, (req, res) => {
    const launch = getPublicLaunch(db, req.params.idOrSlug);
    if (launch.owner_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot support your own launch.');
    const removed = db.prepare('DELETE FROM likes WHERE user_id = ? AND launch_id = ?').run(req.user.id, launch.id).changes;
    if (removed) db.prepare(`UPDATE engagement_events SET retracted_at = ? WHERE id = (
      SELECT id FROM engagement_events WHERE event_type = 'like' AND launch_id = ? AND actor_user_id = ? AND retracted_at IS NULL ORDER BY created_at DESC LIMIT 1
    )`).run(new Date().toISOString(), launch.id, req.user.id);
    const likeCount = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE launch_id = ?').get(launch.id).n;
    return res.json({ liked: false, likeCount });
  });

  router.put('/launches/:idOrSlug/save', auth.requireVerified, limit, (req, res) => {
    const launch = getPublicLaunch(db, req.params.idOrSlug);
    if (launch.owner_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot save your own launch.');
    const createdAt = new Date().toISOString();
    const result = db.prepare('INSERT OR IGNORE INTO saves(user_id, launch_id, created_at) VALUES (?, ?, ?)').run(req.user.id, launch.id, createdAt);
    if (result.changes) db.prepare(`INSERT INTO engagement_events(id, event_type, launch_id, brand_id, actor_user_id, actor_key, local_day, qualified, created_at)
      VALUES (?, 'save', ?, ?, ?, ?, ?, 1, ?)`)
      .run(randomUUID(), launch.id, launch.brand_id, req.user.id, actorKey(req, req.user.id, config.analyticsSalt), localDay(), createdAt);
    if (result.changes) notify(db, launch.owner_user_id, 'save', 'Your business was saved', 'A member saved one of your published launches.', `save:${launch.id}:${req.user.id}:${localDay()}`);
    return res.json({ saved: true });
  });

  router.delete('/launches/:idOrSlug/save', auth.requireVerified, limit, (req, res) => {
    const launch = getPublicLaunch(db, req.params.idOrSlug);
    if (launch.owner_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot save your own launch.');
    const removed = db.prepare('DELETE FROM saves WHERE user_id = ? AND launch_id = ?').run(req.user.id, launch.id).changes;
    if (removed) db.prepare(`UPDATE engagement_events SET retracted_at = ? WHERE id = (
      SELECT id FROM engagement_events WHERE event_type = 'save' AND launch_id = ? AND actor_user_id = ? AND retracted_at IS NULL ORDER BY created_at DESC LIMIT 1
    )`).run(new Date().toISOString(), launch.id, req.user.id);
    return res.json({ saved: false });
  });

  router.get('/me/saved', auth.requireAuth, (req, res) => {
    const { limit: pageLimit, offset } = pageArgs(req.query);
    const where = ['s.user_id = ?', "l.status = 'published'", "b.status = 'published'"];
    const values = [req.user.id];
    if (typeof req.query.category === 'string' && req.query.category) { where.push('l.category = ?'); values.push(req.query.category); }
    const rows = db.prepare(`SELECT l.id FROM saves s JOIN launches l ON l.id = s.launch_id JOIN brands b ON b.id = l.brand_id
      WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`).all(...values, pageLimit + 1, offset);
    return res.json(pageResult(rows.map(row => loadPublicLaunch(db, row.id, req.user)), pageLimit, offset));
  });

  router.put('/businesses/:idOrSlug/save', auth.requireVerified, limit, (req, res) => {
    const business = db.prepare("SELECT id, owner_user_id FROM brands WHERE (id = ? OR slug = ?) AND status = 'published'")
      .get(req.params.idOrSlug, req.params.idOrSlug);
    if (!business) throw new ApiError(404, 'NOT_FOUND', 'This business is unavailable.');
    if (business.owner_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot save your own business.');
    const createdAt = new Date().toISOString();
    const saved = db.prepare('INSERT OR IGNORE INTO business_saves(user_id, brand_id, created_at) VALUES (?, ?, ?)')
      .run(req.user.id, business.id, createdAt);
    if (saved.changes) {
      addBusinessEvent(db, req, req.user, business, 'business_save', config, { source: 'unknown' });
      notify(db, business.owner_user_id, 'business_save', 'Your business was saved',
        'A member saved your business.', dailyDedupe('business-save', `${business.id}:${req.user.id}`));
    }
    return res.json({ saved: true });
  });

  router.delete('/businesses/:idOrSlug/save', auth.requireAuth, limit, (req, res) => {
    const business = db.prepare('SELECT id FROM brands WHERE id = ? OR slug = ?').get(req.params.idOrSlug, req.params.idOrSlug);
    if (business) db.prepare('DELETE FROM business_saves WHERE user_id = ? AND brand_id = ?').run(req.user.id, business.id);
    return res.json({ saved: false });
  });

  router.get('/me/saved-businesses', auth.requireAuth, (req, res) => {
    const { limit: pageLimit, offset } = pageArgs(req.query);
    const rows = db.prepare(`SELECT b.id, b.slug, b.name, b.logo_url AS logoUrl, b.tagline, b.category, b.city, b.state,
        b.business_mode AS businessMode, s.created_at AS savedAt
      FROM business_saves s JOIN brands b ON b.id = s.brand_id
      WHERE s.user_id = ? AND b.status = 'published'
      ORDER BY s.created_at DESC, b.id LIMIT ? OFFSET ?`).all(req.user.id, pageLimit + 1, offset);
    return res.json(pageResult(rows, pageLimit, offset));
  });

  return router;
}
