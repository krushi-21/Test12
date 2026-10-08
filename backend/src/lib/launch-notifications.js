import { notify } from './notifications.js';

export function notifyLaunchAudience(db, launchId, brandId, founderIds, title) {
  const userIds = new Set();
  for (const row of db.prepare("SELECT user_id FROM follows WHERE target_type = 'brand' AND target_id = ?").all(brandId)) userIds.add(row.user_id);
  for (const founderId of founderIds) {
    for (const row of db.prepare("SELECT user_id FROM follows WHERE target_type = 'founder' AND target_id = ?").all(founderId)) userIds.add(row.user_id);
  }
  for (const row of db.prepare("SELECT user_id FROM follows WHERE target_type = 'category' AND target_id = (SELECT category FROM launches WHERE id = ?)").all(launchId)) userIds.add(row.user_id);

  for (const userId of userIds) {
    notify(db, userId, 'followed_launch', 'A new launch you follow', `${title} is now published.`, `launch:${launchId}:${userId}`);
  }
}
