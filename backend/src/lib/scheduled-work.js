import { notify } from './notifications.js';
import { notifyLaunchAudience } from './launch-notifications.js';
import { localDay } from './time.js';

const dueLaunchPredicate = `((l.launch_at IS NOT NULL AND julianday(l.launch_at) <= julianday(?)) OR
  (l.launch_at IS NULL AND l.launch_date IS NOT NULL AND l.launch_date <= ?))`;

function deliverDueNotifications(db, nowAt, userId = null) {
  const timestamp = nowAt.toISOString();
  const day = localDay(nowAt);
  const notifications = db.transaction(() => {
    let reminderCount = 0;
    let endingCount = 0;
    const userFilter = userId ? 's.user_id = ? AND ' : '';
    const values = userId ? [userId, timestamp, day] : [timestamp, day];
    const reminders = db.prepare(`SELECT s.user_id, s.launch_id, l.title
      FROM launch_alert_subscriptions s JOIN launches l ON l.id = s.launch_id JOIN brands b ON b.id = l.brand_id
      WHERE ${userFilter}s.notified_at IS NULL AND l.status = 'published' AND b.status = 'published' AND ${dueLaunchPredicate}
      ORDER BY s.created_at, s.user_id, s.launch_id`).all(...values);
    for (const launch of reminders) {
      const marked = db.prepare('UPDATE launch_alert_subscriptions SET notified_at = ? WHERE user_id = ? AND launch_id = ? AND notified_at IS NULL')
        .run(timestamp, launch.user_id, launch.launch_id);
      if (!marked.changes) continue;
      notify(db, launch.user_id, 'launch_reminder', 'A launch you follow is live', `${launch.title || 'A launch'} has started.`, `launch-reminder:${launch.launch_id}`);
      reminderCount += 1;
    }

    const ownerFilter = userId ? 'owner_user_id = ? AND ' : '';
    const soonValues = userId
      ? [userId, timestamp, new Date(nowAt.getTime() + 48 * 60 * 60_000).toISOString()]
      : [timestamp, new Date(nowAt.getTime() + 48 * 60 * 60_000).toISOString()];
    const soon = db.prepare(`SELECT id, owner_user_id, title FROM launches
      WHERE ${ownerFilter}status = 'published' AND ends_at > ? AND ends_at <= ? ORDER BY ends_at, id`).all(...soonValues);
    for (const launch of soon) {
      notify(db, launch.owner_user_id, 'launch_ending', 'Your launch is ending soon',
        `${launch.title || 'A launch'} is scheduled to end within 48 hours.`, `launch-ending:${launch.id}`);
      endingCount += 1;
    }
    return { reminderCount, endingCount };
  });
  return notifications();
}

export function processUserNotifications(db, userId, currentTime = new Date()) {
  const nowAt = currentTime instanceof Date ? currentTime : new Date(currentTime);
  if (!Number.isFinite(nowAt.getTime())) throw new TypeError('currentTime must be a valid date.');
  return deliverDueNotifications(db, nowAt, userId);
}

export function processScheduledWork(db, currentTime = new Date()) {
  const nowAt = currentTime instanceof Date ? currentTime : new Date(currentTime);
  if (!Number.isFinite(nowAt.getTime())) throw new TypeError('currentTime must be a valid date.');
  const timestamp = nowAt.toISOString();
  const publication = db.transaction(() => {
    let publishedCount = 0;
    const scheduled = db.prepare(`SELECT sp.launch_id, l.brand_id, l.title
      FROM scheduled_publications sp JOIN launches l ON l.id = sp.launch_id JOIN brands b ON b.id = l.brand_id
      WHERE sp.publish_at <= ? AND l.status = 'draft' AND l.moderation_locked = 0 AND b.status = 'published'
      ORDER BY sp.publish_at, sp.launch_id`).all(timestamp);
    for (const launch of scheduled) {
      const result = db.prepare("UPDATE launches SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'draft' AND moderation_locked = 0")
        .run(timestamp, timestamp, launch.launch_id);
      db.prepare('DELETE FROM scheduled_publications WHERE launch_id = ?').run(launch.launch_id);
      if (!result.changes) continue;
      const founderIds = db.prepare('SELECT founder_profile_id FROM launch_founders WHERE launch_id = ? ORDER BY position').all(launch.launch_id)
        .map(row => row.founder_profile_id);
      notifyLaunchAudience(db, launch.launch_id, launch.brand_id, founderIds, launch.title || 'A launch');
      publishedCount += 1;
    }
    return publishedCount;
  });
  const publishedCount = publication();
  const notifications = deliverDueNotifications(db, nowAt);
  return { publishedCount, ...notifications };
}

export function startScheduledWork(db, { intervalMs = 15_000 } = {}) {
  let stopped = false;
  const run = () => {
    if (stopped || !db.open) return;
    try {
      processScheduledWork(db);
    } catch (error) {
      console.error('scheduled_work_failed', { name: error?.name ?? 'Error', code: error?.code ?? 'unknown' });
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
