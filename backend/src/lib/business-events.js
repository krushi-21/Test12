import { randomUUID } from 'node:crypto';
import { actorKey } from './security.js';
import { localDay } from './time.js';

const botPattern = /bot|crawler|spider|headless|preview|facebookexternalhit|slackbot|whatsapp/i;

export function addBusinessEvent(db, req, user, brand, eventType, config, options = {}) {
  if (!brand || user?.id === brand.owner_user_id || botPattern.test(req.get('user-agent') ?? '')) return false;
  const actor = actorKey(req, user?.id, config.analyticsSalt);
  const createdAt = new Date().toISOString();
  const since = new Date(Date.now() - (options.dedupeMinutes ?? 30) * 60_000).toISOString();
  if (db.prepare('SELECT 1 FROM business_events WHERE brand_id = ? AND event_type = ? AND actor_key = ? AND created_at >= ?').get(brand.id, eventType, actor, since)) return false;
  const source = ['direct', 'search', 'following', 'collection', 'trending', 'nearby', 'external', 'unknown'].includes(options.source) ? options.source : 'unknown';
  db.prepare(`INSERT INTO business_events(id, event_type, brand_id, launch_id, product_id, actor_key, source, local_day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), eventType, brand.id, options.launchId ?? null, options.productId ?? null, actor, source, localDay(), createdAt);
  return true;
}
