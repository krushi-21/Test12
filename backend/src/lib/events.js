import { randomUUID } from 'node:crypto';
import { actorKey } from './security.js';
import { localDay, isoNow } from './time.js';

const validSources = new Set(['direct', 'search', 'following', 'collection', 'trending', 'nearby', 'external', 'unknown']);

export function isObviousBot(req) {
  return /bot|crawler|spider|headless|preview|facebookexternalhit|slackbot|whatsapp/i.test(req.get('user-agent') ?? '');
}

export function addEvent(db, req, user, launch, config, eventType, options = {}) {
  if (!launch || (user && launch.owner_user_id === user.id) || isObviousBot(req)) return null;
  const actor = actorKey(req, user?.id, config.analyticsSalt);
  const now = isoNow();
  if (options.dedupeMinutes) {
    const since = new Date(Date.now() - options.dedupeMinutes * 60_000).toISOString();
    const seen = db.prepare(`SELECT 1 FROM engagement_events WHERE launch_id = ? AND event_type = ? AND actor_key = ? AND created_at >= ?`).get(launch.id, eventType, actor, since);
    if (seen) return null;
  }
  const eventId = randomUUID();
  db.prepare(`INSERT INTO engagement_events(id, event_type, launch_id, brand_id, actor_user_id, actor_key,
    destination, source, local_day, qualified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(eventId, eventType, launch.id, launch.brand_id, user?.id ?? null, actor,
      options.destination ?? null, validSources.has(options.source) ? options.source : 'direct', localDay(), options.qualified ? 1 : 0, now);
  return { id: eventId, actorKey: actor, createdAt: now };
}

export function holdOnClickBurst(db, launch, config, moderatorId = null) {
  const since = new Date(Date.now() - config.suspiciousClickWindowMinutes * 60_000).toISOString();
  const count = db.prepare(`SELECT COUNT(*) AS n FROM engagement_events WHERE launch_id = ? AND event_type = 'click_out'
    AND qualified = 1 AND created_at >= ?`).get(launch.id, since).n;
  if (count >= config.suspiciousClickThreshold) {
    const active = db.prepare('SELECT id FROM leaderboard_holds WHERE launch_id = ? AND resolved_at IS NULL').get(launch.id);
    if (!active) db.prepare(`INSERT INTO leaderboard_holds(id, launch_id, source, reason, moderator_user_id, created_at)
      VALUES (?, ?, 'automatic', ?, ?, ?)`).run(randomUUID(), launch.id,
        `${count} qualified outbound taps within ${config.suspiciousClickWindowMinutes} minutes; held for review.`, moderatorId, isoNow());
  }
  return count;
}
