import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { loadPublicLaunch } from '../lib/serializers.js';
import { pageArgs, pageResult } from '../lib/pagination.js';
import { notify, dailyDedupe } from '../lib/notifications.js';
import { addEvent } from '../lib/events.js';
import { processUserNotifications } from '../lib/scheduled-work.js';

const now = () => new Date().toISOString();
const validFollowTypes = new Set(['founder', 'brand', 'category']);

function publicTarget(db, type, id) {
  if (!validFollowTypes.has(type)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a founder, brand, or category to follow.', { targetType: 'Unsupported follow type.' });
  if (type === 'category') return Boolean(db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(id));
  if (type === 'brand') return Boolean(db.prepare("SELECT 1 FROM brands WHERE (id = ? OR slug = ?) AND status = 'published'").get(id, id));
  return Boolean(db.prepare("SELECT 1 FROM founder_profiles WHERE (id = ? OR slug = ?) AND public_profile = 1 AND moderation_status = 'active'").get(id, id));
}

function collectionAccess(db, userId, id) {
  const row = db.prepare('SELECT * FROM collections WHERE id = ? AND owner_user_id = ?').get(id, userId);
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Collection not found.');
  return row;
}

function collectionPayload(db, row, viewerId = null) {
  const launches = db.prepare(`SELECT l.id FROM collection_items ci JOIN launches l ON l.id = ci.launch_id
    JOIN brands b ON b.id = l.brand_id WHERE ci.collection_id = ? AND l.status = 'published' AND b.status = 'published'
    ORDER BY ci.position, ci.added_at`).all(row.id).map(item => loadPublicLaunch(db, item.id));
  return { id: row.id, name: row.name, description: row.description ?? undefined, isPublic: Boolean(row.is_public),
    shareUrl: row.is_public ? `/test/collection/${row.share_token}` : undefined, createdAt: row.created_at,
    updatedAt: row.updated_at, launchCount: launches.length, launches,
    ...(viewerId && row.owner_user_id === viewerId ? { owner: true } : {}) };
}

export function createCommunityRouter({ db, auth, config }) {
  const router = Router();
  router.use(auth.optionalAuth);

  router.put('/me/follows/:targetType/:targetId', auth.requireVerified, (req, res) => {
    const { targetType, targetId } = req.params;
    if (!publicTarget(db, targetType, targetId)) throw new ApiError(404, 'NOT_FOUND', 'This public account, business, or category is unavailable.');
    const canonical = targetType === 'brand'
      ? db.prepare('SELECT id, owner_user_id FROM brands WHERE (id = ? OR slug = ?) AND status = \'published\'').get(targetId, targetId)
      : targetType === 'founder'
        ? db.prepare('SELECT id, user_id FROM founder_profiles WHERE (id = ? OR slug = ?) AND public_profile = 1 AND moderation_status = \'active\'').get(targetId, targetId)
        : { id: targetId };
    if ((targetType === 'brand' && canonical.owner_user_id === req.user.id) || (targetType === 'founder' && canonical.user_id === req.user.id)) {
      throw new ApiError(403, 'FORBIDDEN', 'You cannot follow your own profile or business.');
    }
    db.prepare('INSERT OR IGNORE INTO follows(user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)')
      .run(req.user.id, targetType, canonical.id, now());
    if (targetType === 'founder') notify(db, canonical.user_id, 'follow', 'Someone followed you', 'A member followed your public founder profile.', dailyDedupe('follow', canonical.id));
    if (targetType === 'brand') notify(db, canonical.owner_user_id, 'follow', 'Your business was followed', 'A member followed one of your published businesses.', dailyDedupe('follow-brand', canonical.id));
    return res.json({ following: true, targetType, targetId: canonical.id });
  });

  router.delete('/me/follows/:targetType/:targetId', auth.requireAuth, (req, res) => {
    const { targetType, targetId } = req.params;
    if (!validFollowTypes.has(targetType)) throw new ApiError(422, 'VALIDATION_ERROR', 'Unsupported follow type.', { targetType: 'Use founder, brand, or category.' });
    const row = targetType === 'category' ? { id: targetId } : db.prepare(`SELECT id FROM ${targetType === 'brand' ? 'brands' : 'founder_profiles'} WHERE id = ? OR slug = ?`).get(targetId, targetId);
    if (row) db.prepare('DELETE FROM follows WHERE user_id = ? AND target_type = ? AND target_id = ?').run(req.user.id, targetType, row.id);
    return res.json({ following: false });
  });

  router.get('/me/follows', auth.requireAuth, (req, res) => {
    const rows = db.prepare('SELECT target_type, target_id, created_at FROM follows WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const items = rows.map(row => {
      if (row.target_type === 'category') {
        const category = db.prepare('SELECT id, name FROM categories WHERE id = ? AND active = 1').get(row.target_id);
        return category && { targetType: row.target_type, targetId: row.target_id, name: category.name, createdAt: row.created_at };
      }
      if (row.target_type === 'brand') {
        const brand = db.prepare("SELECT id, slug, name, category, city FROM brands WHERE id = ? AND status = 'published'").get(row.target_id);
        return brand && { targetType: row.target_type, targetId: brand.id, ...brand, createdAt: row.created_at };
      }
      const founder = db.prepare("SELECT id, slug, display_name AS displayName FROM founder_profiles WHERE id = ? AND public_profile = 1 AND moderation_status = 'active'").get(row.target_id);
      return founder && { targetType: row.target_type, targetId: founder.id, ...founder, createdAt: row.created_at };
    }).filter(Boolean);
    return res.json({ items });
  });

  router.get('/me/following', auth.requireAuth, (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const rows = db.prepare(`SELECT DISTINCT l.id FROM launches l JOIN brands b ON b.id = l.brand_id
      WHERE l.status = 'published' AND b.status = 'published' AND l.owner_user_id != ? AND (
        EXISTS (SELECT 1 FROM follows f WHERE f.user_id = ? AND f.target_type = 'brand' AND f.target_id = b.id) OR
        EXISTS (SELECT 1 FROM follows f JOIN launch_founders lf ON f.target_id = lf.founder_profile_id
          WHERE f.user_id = ? AND f.target_type = 'founder' AND lf.launch_id = l.id) OR
        EXISTS (SELECT 1 FROM follows f WHERE f.user_id = ? AND f.target_type = 'category' AND f.target_id = l.category))
      ORDER BY l.published_at DESC, l.id LIMIT ? OFFSET ?`).all(req.user.id, req.user.id, req.user.id, req.user.id, limit + 1, offset);
    if (!config.previewReadOnly) for (const item of rows.slice(0, limit)) {
      const launch = db.prepare('SELECT id, brand_id, owner_user_id FROM launches WHERE id = ?').get(item.id);
      addEvent(db, req, req.user, launch, config, 'impression', { dedupeMinutes: 30, source: 'following' });
    }
    return res.json(pageResult(rows.map(row => loadPublicLaunch(db, row.id, req.user)), limit, offset));
  });

  router.get('/me/notifications', auth.requireAuth, (req, res) => {
    if (!config.previewReadOnly) processUserNotifications(db, req.user.id);
    const { limit, offset } = pageArgs(req.query);
    const rows = db.prepare('SELECT id, kind, subject, message, created_at AS createdAt, read_at AS readAt FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(req.user.id, limit + 1, offset);
    const unreadCount = db.prepare('SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n;
    return res.json({ ...pageResult(rows, limit, offset), unreadCount });
  });

  router.patch('/me/notifications/:id/read', auth.requireAuth, (req, res) => {
    db.prepare('UPDATE user_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(now(), req.params.id, req.user.id);
    return res.status(204).end();
  });

  router.post('/me/notifications/read-all', auth.requireAuth, (req, res) => {
    db.prepare('UPDATE user_notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?').run(now(), req.user.id);
    return res.json({ updated: true });
  });

  router.get('/me/collections', auth.requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM collections WHERE owner_user_id = ? ORDER BY updated_at DESC').all(req.user.id);
    return res.json({ items: rows.map(row => collectionPayload(db, row, req.user.id)) });
  });

  router.get('/collections/public', (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const rows = db.prepare('SELECT * FROM collections WHERE is_public = 1 ORDER BY updated_at DESC, id LIMIT ? OFFSET ?')
      .all(limit + 1, offset);
    return res.json(pageResult(rows.map(row => collectionPayload(db, row)), limit, offset));
  });

  router.post('/me/collections', auth.requireAuth, (req, res) => {
    const input = req.body?.collection ?? {};
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    if (!name || name.length > 80) throw new ApiError(422, 'VALIDATION_ERROR', 'Add a collection name of up to 80 characters.', { name: 'A name is required.' });
    if (description.length > 500) throw new ApiError(422, 'VALIDATION_ERROR', 'Collection description is too long.', { description: 'Use 500 characters or fewer.' });
    if (input.isPublic !== undefined && typeof input.isPublic !== 'boolean') throw new ApiError(422, 'VALIDATION_ERROR', 'Choose whether the collection is public.', { isPublic: 'Use true or false.' });
    const id = randomUUID(), time = now();
    db.prepare('INSERT INTO collections(id, owner_user_id, name, description, is_public, share_token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, name, description || null, input.isPublic ? 1 : 0, randomUUID(), time, time);
    return res.status(201).json({ item: collectionPayload(db, db.prepare('SELECT * FROM collections WHERE id = ?').get(id), req.user.id) });
  });

  router.patch('/me/collections/:id', auth.requireAuth, (req, res) => {
    const collection = collectionAccess(db, req.user.id, req.params.id);
    const input = req.body?.collection ?? {};
    const name = input.name === undefined ? collection.name : typeof input.name === 'string' ? input.name.trim() : '';
    const description = input.description === undefined ? collection.description ?? '' : typeof input.description === 'string' ? input.description.trim() : '';
    const isPublic = input.isPublic === undefined ? Boolean(collection.is_public) : input.isPublic;
    if (!name || name.length > 80) throw new ApiError(422, 'VALIDATION_ERROR', 'Add a collection name of up to 80 characters.', { name: 'A name is required.' });
    if (description.length > 500 || typeof isPublic !== 'boolean') throw new ApiError(422, 'VALIDATION_ERROR', 'Check collection fields.', { collection: 'Description must be under 500 characters and visibility must be boolean.' });
    db.prepare('UPDATE collections SET name = ?, description = ?, is_public = ?, updated_at = ? WHERE id = ?')
      .run(name, description || null, Number(isPublic), now(), collection.id);
    return res.json({ item: collectionPayload(db, db.prepare('SELECT * FROM collections WHERE id = ?').get(collection.id), req.user.id) });
  });

  router.delete('/me/collections/:id', auth.requireAuth, (req, res) => {
    collectionAccess(db, req.user.id, req.params.id);
    db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
    return res.status(204).end();
  });

  router.post('/me/collections/:id/items', auth.requireAuth, (req, res) => {
    const collection = collectionAccess(db, req.user.id, req.params.id);
    const launchId = req.body?.launchId;
    const launch = typeof launchId === 'string' ? db.prepare("SELECT l.id FROM launches l JOIN brands b ON b.id = l.brand_id WHERE (l.id = ? OR l.slug = ?) AND l.status = 'published' AND b.status = 'published'").get(launchId, launchId) : null;
    if (!launch) throw new ApiError(404, 'NOT_FOUND', 'Choose a published launch.');
    const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS n FROM collection_items WHERE collection_id = ?').get(collection.id).n;
    db.prepare('INSERT OR IGNORE INTO collection_items(collection_id, launch_id, position, added_at) VALUES (?, ?, ?, ?)').run(collection.id, launch.id, position, now());
    db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now(), collection.id);
    return res.json({ item: collectionPayload(db, db.prepare('SELECT * FROM collections WHERE id = ?').get(collection.id), req.user.id) });
  });

  router.delete('/me/collections/:id/items/:launchId', auth.requireAuth, (req, res) => {
    const collection = collectionAccess(db, req.user.id, req.params.id);
    const launch = db.prepare('SELECT id FROM launches WHERE id = ? OR slug = ?').get(req.params.launchId, req.params.launchId);
    if (launch) db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND launch_id = ?').run(collection.id, launch.id);
    db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(now(), collection.id);
    return res.status(204).end();
  });

  router.get('/collections/share/:token', (req, res) => {
    const collection = db.prepare('SELECT * FROM collections WHERE share_token = ? AND is_public = 1').get(req.params.token);
    if (!collection) throw new ApiError(404, 'NOT_FOUND', 'This public collection is unavailable.');
    const item = collectionPayload(db, collection);
    if (!config.previewReadOnly) for (const launchItem of item.launches) {
      const launch = db.prepare('SELECT id, brand_id, owner_user_id FROM launches WHERE id = ?').get(launchItem.id);
      addEvent(db, req, req.user, launch, config, 'impression', { dedupeMinutes: 30, source: 'collection' });
    }
    return res.json({ item });
  });

  return router;
}
