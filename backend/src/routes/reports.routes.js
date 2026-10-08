import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { parse } from '../lib/domain.js';
import { makeLimiter } from '../lib/rate-limit.js';
import { appealSchema, reportSchema } from '../validation.js';

const now = () => new Date().toISOString();

function publicSubject(db, type, id) {
  if (type === 'launch') return db.prepare(`SELECT l.id, l.owner_user_id FROM launches l JOIN brands b ON b.id = l.brand_id
    WHERE l.id = ? AND l.status = 'published' AND b.status = 'published'`).get(id);
  if (type === 'brand') return db.prepare("SELECT id, owner_user_id FROM brands WHERE id = ? AND status = 'published'").get(id);
  return db.prepare("SELECT id, user_id AS owner_user_id FROM founder_profiles WHERE id = ? AND public_profile = 1 AND moderation_status = 'active'").get(id);
}

function appealedSubject(db, type, id) {
  if (type === 'launch') return db.prepare("SELECT id, owner_user_id, status FROM launches WHERE id = ? AND status IN ('paused', 'removed') AND moderation_locked = 1").get(id);
  if (type === 'brand') return db.prepare("SELECT id, owner_user_id, status FROM brands WHERE id = ? AND status IN ('paused', 'removed') AND moderation_locked = 1").get(id);
  return db.prepare("SELECT id, user_id AS owner_user_id, moderation_status AS status FROM founder_profiles WHERE id = ? AND moderation_status IN ('paused', 'removed')").get(id);
}

export function createReportsRouter({ db, auth }) {
  const router = Router();
  const reportLimit = makeLimiter({ windowMs: 60 * 60_000, limit: 8, message: 'Too many reports or appeals. Try again later.' });

  router.post('/reports', auth.requireAuth, reportLimit, (req, res) => {
    const input = parse(reportSchema, req.body);
    const subject = publicSubject(db, input.subjectType, input.subjectId);
    if (!subject) throw new ApiError(404, 'NOT_FOUND', 'This public page or launch is unavailable.');
    if (subject.owner_user_id === req.user.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot report your own content.');
    const id = randomUUID(), time = now();
    try {
      db.prepare(`INSERT INTO reports(id, subject_type, subject_id, subject_owner_user_id, reporter_user_id, reason, details, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`)
        .run(id, input.subjectType, input.subjectId, subject.owner_user_id, req.user.id, input.reason, input.details ?? null, time, time);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new ApiError(409, 'CONFLICT', 'You already have an open report for this content.');
      throw error;
    }
    return res.status(201).json({ id, status: 'submitted' });
  });

  router.post('/me/moderation/appeals', auth.requireAuth, reportLimit, (req, res) => {
    const input = parse(appealSchema, req.body);
    const subject = appealedSubject(db, input.subjectType, input.subjectId);
    if (!subject) throw new ApiError(409, 'CONFLICT', 'Only paused or removed content can be appealed.');
    if (subject.owner_user_id !== req.user.id) throw new ApiError(403, 'FORBIDDEN', 'Only the content owner can appeal this decision.');
    const existing = db.prepare("SELECT id FROM appeals WHERE subject_type = ? AND subject_id = ? AND owner_user_id = ? AND status IN ('submitted', 'under_review')")
      .get(input.subjectType, input.subjectId, req.user.id);
    if (existing) throw new ApiError(409, 'CONFLICT', 'An appeal is already open for this content.');
    const id = randomUUID(), time = now();
    db.prepare('INSERT INTO appeals(id, subject_type, subject_id, owner_user_id, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'submitted\', ?, ?)')
      .run(id, input.subjectType, input.subjectId, req.user.id, input.reason, time, time);
    return res.status(201).json({ id, status: 'submitted' });
  });

  return router;
}
