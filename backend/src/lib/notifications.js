import { randomUUID } from 'node:crypto';
import { isoNow, localDay } from './time.js';

export function notify(db, userId, kind, subject, message, dedupeKey = null) {
  if (!userId) return;
  db.prepare(`INSERT OR IGNORE INTO user_notifications(id, user_id, kind, subject, message, created_at, dedupe_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, kind, subject.slice(0, 160), message.slice(0, 500), isoNow(), dedupeKey);
}

export function dailyDedupe(prefix, subjectId) {
  return `${prefix}:${subjectId}:${localDay()}`;
}
