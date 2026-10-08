import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { parse } from '../lib/domain.js';
import { holdActionSchema, moderationActionSchema } from '../validation.js';

const now = () => new Date().toISOString();
const subjectTables = { launch: ['launches', 'status'], brand: ['brands', 'status'], founder: ['founder_profiles', 'moderation_status'] };

function subjectPreview(db, type, id) {
  if (type === 'launch') return db.prepare(`SELECT l.id, l.slug, l.title AS name, l.status, b.name AS brandName FROM launches l JOIN brands b ON b.id = l.brand_id WHERE l.id = ?`).get(id);
  if (type === 'brand') return db.prepare('SELECT id, slug, name, status FROM brands WHERE id = ?').get(id);
  return db.prepare('SELECT id, slug, display_name AS name, moderation_status AS status FROM founder_profiles WHERE id = ?').get(id);
}

function changeSubjectStatus(db, type, id, action) {
  const [table, column] = subjectTables[type];
  const current = db.prepare(`SELECT ${column} AS status FROM ${table} WHERE id = ?`).get(id);
  if (!current) throw new ApiError(404, 'NOT_FOUND', 'Reported content was not found.');
  const previous = current.status;
  let result = previous;
  if (action === 'pause') result = 'paused';
  else if (action === 'remove') result = 'removed';
  else if (action === 'restore') {
    if (!['paused', 'removed'].includes(previous)) throw new ApiError(409, 'CONFLICT', 'Only paused or removed content can be restored.');
    result = type === 'founder' ? 'active' : 'published';
  }
  if (['pause', 'remove', 'restore'].includes(action)) {
    if (type === 'founder') db.prepare(`UPDATE ${table} SET ${column} = ?, updated_at = ? WHERE id = ?`).run(result, now(), id);
    else db.prepare(`UPDATE ${table} SET ${column} = ?, moderation_locked = ?, updated_at = ? WHERE id = ?`)
      .run(result, Number(action !== 'restore'), now(), id);
  }
  return { previous, result };
}

async function createNotification(db, sendEmail, ownerId, kind, subject, message) {
  const id = randomUUID(), time = now();
  db.prepare('INSERT INTO user_notifications(id, user_id, kind, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, ownerId, kind, subject, message, time);
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(ownerId);
  if (user?.email) {
    try { await sendEmail({ to: user.email, subject, text: message }); } catch { /* the durable in-app notification remains available */ }
  }
}

function formatReport(db, report) {
  const moderationHistory = db.prepare(`SELECT a.action, a.reason, a.previous_status AS previousStatus,
    a.resulting_status AS resultingStatus, a.created_at AS createdAt, u.display_name AS moderatorName
    FROM moderation_actions a JOIN users u ON u.id = a.moderator_user_id WHERE a.report_id = ? ORDER BY a.created_at ASC`).all(report.id);
  return { id: report.id, subjectType: report.subject_type, subjectId: report.subject_id, reason: report.reason,
    details: report.details ?? undefined, status: report.status, createdAt: report.created_at, updatedAt: report.updated_at,
    subjectPreview: subjectPreview(db, report.subject_type, report.subject_id) ?? { unavailable: true }, moderationHistory };
}

export function createAdminRouter({ db, auth, sendEmail }) {
  const router = Router();

  router.get('/admin/reports', auth.requireModerator, (req, res) => {
    const status = req.query.status ?? 'open';
    if (!['open', 'under_review'].includes(status)) throw new ApiError(422, 'VALIDATION_ERROR', 'status must be open or under_review.', { status: 'Use open or under_review.' });
    const reports = db.prepare('SELECT * FROM reports WHERE status = ? ORDER BY created_at ASC LIMIT 100').all(status).map(row => formatReport(db, row));
    return res.json({ items: reports });
  });

  router.get('/admin/leaderboard/holds', auth.requireModerator, (_req, res) => {
    const rows = db.prepare(`SELECT h.id, h.launch_id AS launchId, h.source, h.reason, h.created_at AS createdAt,
      l.title AS launchTitle, l.slug AS launchSlug, b.name AS brandName
      FROM leaderboard_holds h JOIN launches l ON l.id = h.launch_id JOIN brands b ON b.id = l.brand_id
      WHERE h.resolved_at IS NULL ORDER BY h.created_at ASC`).all();
    return res.json({ items: rows });
  });

  router.post('/admin/reports/:id/actions', auth.requireModerator, async (req, res) => {
    const input = parse(moderationActionSchema, req.body);
    const reportStatus = input.action === 'dismiss' ? 'dismissed' : input.action === 'request_changes' ? 'under_review' : 'actioned';
    const time = now();
    const outcome = db.transaction(() => {
      const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(req.params.id);
      if (!report) throw new ApiError(404, 'NOT_FOUND', 'Report not found.');
      if (!['open', 'under_review'].includes(report.status)) throw new ApiError(409, 'CONFLICT', 'This report has already been resolved.');
      const { previous, result } = changeSubjectStatus(db, report.subject_type, report.subject_id, input.action);
      db.prepare(`INSERT INTO moderation_actions(id, report_id, subject_type, subject_id, moderator_user_id, action, reason, previous_status, resulting_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), report.id, report.subject_type, report.subject_id, req.user.id, input.action, input.reason, previous, result, time);
      db.prepare('UPDATE reports SET status = ?, updated_at = ? WHERE id = ?').run(reportStatus, time, report.id);
      return { ownerId: report.subject_owner_user_id, updated: db.prepare('SELECT * FROM reports WHERE id = ?').get(report.id), result };
    })();
    const decision = ({ dismiss: 'We reviewed a report about your content and took no action.',
      request_changes: 'A moderator reviewed a report and requests that you review the content.',
      pause: 'A moderator paused your content after reviewing a report.',
      remove: 'A moderator removed your content after reviewing a report.',
      restore: 'A moderator restored your content after reviewing a report.' })[input.action];
    const message = `${decision}\nReason: ${input.reason}\nIf your launch, brand, or founder profile was paused or removed, you may appeal through the app’s moderation appeal flow.`;
    await createNotification(db, sendEmail, outcome.ownerId, 'moderation_decision', 'Launch Platform moderation update', message);
    return res.json({ report: formatReport(db, outcome.updated), subjectStatus: outcome.result });
  });

  router.post('/admin/leaderboard/holds/:launchId', auth.requireModerator, async (req, res) => {
    const input = parse(holdActionSchema, req.body);
    const launch = db.prepare('SELECT id, owner_user_id, status FROM launches WHERE id = ?').get(req.params.launchId);
    if (!launch) throw new ApiError(404, 'NOT_FOUND', 'Launch not found.');
    const time = now();
    const held = db.transaction(() => {
      let onHold;
      if (input.action === 'hold') {
        const active = db.prepare('SELECT id FROM leaderboard_holds WHERE launch_id = ? AND resolved_at IS NULL').get(launch.id);
        if (active) db.prepare("UPDATE leaderboard_holds SET source = 'moderator', reason = ?, moderator_user_id = ? WHERE id = ?").run(input.reason, req.user.id, active.id);
        else db.prepare(`INSERT INTO leaderboard_holds(id, launch_id, source, reason, moderator_user_id, created_at) VALUES (?, ?, 'moderator', ?, ?, ?)`)
          .run(randomUUID(), launch.id, input.reason, req.user.id, time);
        onHold = true;
      } else {
        const active = db.prepare('SELECT id FROM leaderboard_holds WHERE launch_id = ? AND resolved_at IS NULL').get(launch.id);
        if (active) db.prepare('UPDATE leaderboard_holds SET resolved_at = ?, resolved_by = ?, resolution_reason = ? WHERE id = ?').run(time, req.user.id, input.reason, active.id);
        onHold = false;
      }
      db.prepare(`INSERT INTO moderation_actions(id, subject_type, subject_id, moderator_user_id, action, reason, created_at)
        VALUES (?, 'launch', ?, ?, ?, ?, ?)`)
        .run(randomUUID(), launch.id, req.user.id, input.action, input.reason, time);
      return onHold;
    })();
    await createNotification(db, sendEmail, launch.owner_user_id, 'leaderboard_review', 'Launch ranking review update',
      `A moderator ${held ? 'placed your launch on hold from the leaderboard' : 'reinstated your launch on the leaderboard'}.\nReason: ${input.reason}`);
    return res.json({ held });
  });

  router.get('/admin/appeals', auth.requireModerator, (req, res) => {
    const status = req.query.status ?? 'submitted';
    if (!['submitted', 'under_review', 'dismissed', 'restored'].includes(status)) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid appeal status.', { status: 'Choose a valid appeal status.' });
    const items = db.prepare('SELECT id, subject_type AS subjectType, subject_id AS subjectId, owner_user_id AS ownerUserId, reason, status, created_at AS createdAt FROM appeals WHERE status = ? ORDER BY created_at ASC LIMIT 100').all(status);
    return res.json({ items });
  });

  router.post('/admin/appeals/:id/actions', auth.requireModerator, async (req, res) => {
    const body = req.body ?? {};
    if (!['dismiss', 'restore', 'request_changes'].includes(body.action) || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 1000) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Provide an appeal action and reason.', { action: 'Use dismiss, restore, or request_changes.', reason: 'Enter a reason from 3 to 1000 characters.' });
    }
    const action = body.action;
    const status = action === 'dismiss' ? 'dismissed' : action === 'restore' ? 'restored' : 'under_review';
    const time = now();
    const outcome = db.transaction(() => {
      const appeal = db.prepare('SELECT * FROM appeals WHERE id = ?').get(req.params.id);
      if (!appeal) throw new ApiError(404, 'NOT_FOUND', 'Appeal not found.');
      if (!['submitted', 'under_review'].includes(appeal.status)) throw new ApiError(409, 'CONFLICT', 'This appeal has already been resolved.');
      const { previous, result } = changeSubjectStatus(db, appeal.subject_type, appeal.subject_id, action === 'request_changes' ? 'none' : action);
      db.prepare(`INSERT INTO moderation_actions(id, subject_type, subject_id, moderator_user_id, action, reason, previous_status, resulting_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), appeal.subject_type, appeal.subject_id, req.user.id, action, body.reason.trim(), previous, result, time);
      db.prepare('UPDATE appeals SET status = ?, updated_at = ? WHERE id = ?').run(status, time, appeal.id);
      return { id: appeal.id, ownerId: appeal.owner_user_id, result };
    })();
    await createNotification(db, sendEmail, outcome.ownerId, 'appeal_decision', 'Launch Platform appeal update',
      `Your appeal was ${status === 'restored' ? 'accepted and the content was restored' : status === 'dismissed' ? 'reviewed and dismissed' : 'reviewed; it remains under review'}.\nReason: ${body.reason.trim()}`);
    return res.json({ id: outcome.id, status, subjectStatus: outcome.result });
  });

  return router;
}
