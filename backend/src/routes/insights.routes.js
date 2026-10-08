import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { actorKey } from '../lib/security.js';
import { localDay, periodBounds } from '../lib/time.js';
import { notify, dailyDedupe } from '../lib/notifications.js';
import { makeLimiter } from '../lib/rate-limit.js';

const VALID_ACTIONS = new Set(['profile_view', 'website_click', 'whatsapp_click', 'call_click', 'email_click', 'directions_click', 'quote_click', 'demo_click', 'store_visit_click', 'product_click']);
const VALID_SOURCES = new Set(['direct', 'search', 'following', 'collection', 'trending', 'nearby', 'external', 'unknown']);
const now = () => new Date().toISOString();

function shiftDay(day, amount) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function weekStart(day) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function monthStart(offset = 0) {
  const day = localDay();
  const [year, month] = day.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
}
function makeBuckets(period, legacyRange) {
  if (period === 'weekly') {
    const current = weekStart(localDay());
    return Array.from({ length: 8 }, (_, index) => weekStart(shiftDay(current, -(7 * (7 - index)))));
  }
  if (period === 'monthly') return Array.from({ length: 6 }, (_, index) => monthStart(index - 5));
  const count = legacyRange === '30d' ? 30 : 7;
  return Array.from({ length: count }, (_, index) => localDay(new Date(Date.now() - (count - 1 - index) * 86_400_000)));
}
function bucketKey(period, day) { return period === 'weekly' ? weekStart(day) : period === 'monthly' ? day.slice(0, 7) : day; }

export function createInsightsRouter({ db, auth, config }) {
  const router = Router();
  router.use(auth.optionalAuth);
  const eventLimit = makeLimiter({ windowMs: 60_000, limit: 90, message: 'Too many interaction events. Please wait before trying again.' });

  router.post('/businesses/:id/events', eventLimit, (req, res) => {
    const brand = db.prepare("SELECT id, owner_user_id FROM brands WHERE (id = ? OR slug = ?) AND status = 'published'").get(req.params.id, req.params.id);
    if (!brand) throw new ApiError(404, 'NOT_FOUND', 'This business is unavailable.');
    const eventType = req.body?.eventType;
    if (!VALID_ACTIONS.has(eventType)) throw new ApiError(422, 'VALIDATION_ERROR', 'Unsupported business interaction.', { eventType: 'Choose a supported action.' });
    if (req.user?.id === brand.owner_user_id || /bot|crawler|spider|headless|preview/i.test(req.get('user-agent') ?? '')) return res.status(202).json({ accepted: true, counted: false });
    const launch = req.body?.launchId ? db.prepare('SELECT id FROM launches WHERE (id = ? OR slug = ?) AND brand_id = ? AND status = \'published\'').get(req.body.launchId, req.body.launchId, brand.id) : null;
    const sourceCandidate = typeof req.body?.source === 'string' ? req.body.source.toLowerCase() : 'direct';
    const source = VALID_SOURCES.has(sourceCandidate) ? sourceCandidate : 'unknown';
    let productId = null;
    if (eventType === 'product_click') {
      productId = typeof req.body?.productId === 'string' ? req.body.productId : null;
      if (!productId || productId.length > 80 || !db.prepare('SELECT 1 FROM products WHERE id = ? AND brand_id = ?').get(productId, brand.id)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a product in this business catalog.', { productId: 'This product is unavailable.' });
      }
    }
    const actor = actorKey(req, req.user?.id, config.analyticsSalt);
    const day = localDay();
    const recent = db.prepare('SELECT 1 FROM business_events WHERE brand_id = ? AND event_type = ? AND actor_key = ? AND created_at >= ?').get(brand.id, eventType, actor, new Date(Date.now() - 30 * 60_000).toISOString());
    if (!recent) db.prepare(`INSERT INTO business_events(id, event_type, brand_id, launch_id, product_id, actor_key, source, local_day, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), eventType, brand.id, launch?.id ?? null, productId, actor, source, day, now());
    return res.status(202).json({ accepted: true, counted: !recent });
  });

  router.get('/me/dashboard', auth.requireAuth, (req, res) => {
    const period = ['daily', 'weekly', 'monthly'].includes(req.query.period) ? req.query.period : 'daily';
    const legacyRange = req.query.range === '30d' ? '30d' : '7d';
    const buckets = makeBuckets(period, legacyRange);
    const startDay = period === 'monthly' ? `${buckets[0]}-01` : buckets[0];
    const brands = db.prepare('SELECT id, name, slug FROM brands WHERE owner_user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const brandIds = brands.map(item => item.id);
    if (!brandIds.length) return res.json({ range: legacyRange, period, timezone: 'Asia/Kolkata', totals: emptyTotals(), series: [], sources: [], bestLaunch: null, bestProduct: null, websiteConversion: 0, launches: [], brands: [] });
    const marks = brandIds.map(() => '?').join(',');
    const eventRows = db.prepare(`SELECT local_day AS date, event_type AS eventType, COUNT(*) AS count FROM business_events
      WHERE brand_id IN (${marks}) AND local_day >= ? GROUP BY local_day, event_type`).all(...brandIds, startDay);
    const engagedRows = db.prepare(`SELECT local_day AS date, event_type AS eventType, destination, COUNT(*) AS count FROM engagement_events
      WHERE brand_id IN (${marks}) AND local_day >= ? AND retracted_at IS NULL GROUP BY local_day, event_type, destination`).all(...brandIds, startDay);
    const seriesByKey = new Map(buckets.map(key => [key, { date: key, views: 0, profileVisits: 0, launchViews: 0, feedImpressions: 0,
      websiteClicks: 0, whatsappClicks: 0, calls: 0, emails: 0, directions: 0, quoteRequests: 0, demoBookings: 0, storeVisits: 0,
      productClicks: 0, saves: 0, likes: 0, shares: 0 }]));
    const eventFields = { profile_view: 'profileVisits', website_click: 'websiteClicks', whatsapp_click: 'whatsappClicks', call_click: 'calls',
      email_click: 'emails', directions_click: 'directions', quote_click: 'quoteRequests', demo_click: 'demoBookings',
      store_visit_click: 'storeVisits', product_click: 'productClicks', business_save: 'saves' };
    for (const row of eventRows) {
      const bucket = seriesByKey.get(bucketKey(period, row.date));
      if (bucket && eventFields[row.eventType]) bucket[eventFields[row.eventType]] += row.count;
    }
    for (const row of engagedRows) {
      const bucket = seriesByKey.get(bucketKey(period, row.date));
      if (!bucket) continue;
      if (row.eventType === 'impression') bucket.feedImpressions += row.count;
      if (row.eventType === 'detail_view') bucket.launchViews += row.count;
      if (row.eventType === 'like') bucket.likes += row.count;
      if (row.eventType === 'save') bucket.saves += row.count;
      if (row.eventType === 'share') bucket.shares += row.count;
      if (row.eventType === 'click_out' && row.destination === 'website') bucket.websiteClicks += row.count;
      if (row.eventType === 'click_out' && row.destination === 'whatsapp') bucket.whatsappClicks += row.count;
    }
    const series = [...seriesByKey.values()];
    for (const bucket of series) bucket.views = bucket.profileVisits + bucket.launchViews;
    const totals = Object.fromEntries(Object.keys(emptyTotals()).map(key => [key, series.reduce((sum, row) => sum + row[key], 0)]));
    const sourceRows = db.prepare(`SELECT source, SUM(count) AS count FROM (
      SELECT source, COUNT(*) AS count FROM business_events WHERE brand_id IN (${marks}) AND local_day >= ? GROUP BY source
      UNION ALL
      SELECT source, COUNT(*) AS count FROM engagement_events WHERE brand_id IN (${marks}) AND local_day >= ? GROUP BY source
    ) GROUP BY source ORDER BY count DESC LIMIT 8`).all(...brandIds, startDay, ...brandIds, startDay);
    const launchRows = db.prepare(`SELECT l.id, l.slug, l.title, b.name AS brandName, COUNT(e.id) AS views FROM launches l JOIN brands b ON b.id = l.brand_id
      LEFT JOIN engagement_events e ON e.launch_id = l.id AND e.event_type = 'detail_view' AND e.local_day >= ? AND e.retracted_at IS NULL
      WHERE l.owner_user_id = ? AND l.status = 'published' GROUP BY l.id ORDER BY views DESC, l.published_at DESC LIMIT 10`).all(startDay, req.user.id);
    const bestProduct = db.prepare(`SELECT p.name, p.brand_id AS brandId, COUNT(*) AS clicks FROM business_events e
      JOIN products p ON p.id = e.product_id AND p.brand_id = e.brand_id
      WHERE e.brand_id IN (${marks}) AND e.event_type = 'product_click' AND e.local_day >= ?
      GROUP BY p.id ORDER BY clicks DESC, p.name LIMIT 1`).get(...brandIds, startDay) ?? null;
    const websiteClicks = totals.websiteClicks;
    const conversion = totals.views ? Number((websiteClicks / totals.views * 100).toFixed(1)) : 0;
    return res.json({ range: legacyRange, period, timezone: 'Asia/Kolkata', totals, series, sources: sourceRows,
      bestLaunch: launchRows[0] ?? null, bestProduct, websiteConversion: conversion,
      launches: launchRows.map(item => ({ ...item, href: `/test/launch/${item.slug}` })), brands });
  });

  router.get('/trending/dashboard', (_req, res) => {
    const day = localDay();
    const todayBounds = { start: `${day}T00:00:00+05:30`, end: new Date().toISOString() };
    const weekBounds = periodBounds('weekly'), monthBounds = periodBounds('monthly');
    const rank = bounds => db.prepare(`SELECT l.id, l.slug, l.title, b.name AS brandName, b.city, b.category,
      (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'like' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ? AND e.created_at < ?) +
      2 * (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'save' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ? AND e.created_at < ?) +
      3 * (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'click_out' AND e.qualified = 1 AND e.created_at >= ? AND e.created_at < ?) AS score
      FROM launches l JOIN brands b ON b.id = l.brand_id WHERE l.status = 'published' AND b.status = 'published' AND l.leaderboard_opt_out = 0
      ORDER BY score DESC, l.published_at DESC LIMIT 12`)
      .all(bounds.start, bounds.end, bounds.start, bounds.end, bounds.start, bounds.end).map((item, index) => ({ rank: index + 1, ...item }));
    const today = rank(todayBounds), week = rank(weekBounds), month = rank(monthBounds);
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const recentBrands = db.prepare(`SELECT b.id, b.slug, b.name, b.city, b.category, b.created_at AS createdAt,
      (SELECT COUNT(*) FROM business_events be WHERE be.brand_id = b.id AND be.created_at >= ?) +
      (SELECT COUNT(*) FROM engagement_events e WHERE e.brand_id = b.id AND e.event_type IN ('like', 'save', 'click_out') AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ?) AS interactions
      FROM brands b WHERE b.status = 'published' ORDER BY interactions DESC, b.created_at DESC LIMIT 12`).all(since, since);
    return res.json({ today, week, month, risingBusinesses: recentBrands,
      generatedAt: new Date().toISOString(), note: 'Rankings use synthetic preview activity and are provisional.' });
  });

  return router;
}

function emptyTotals() { return { views: 0, profileVisits: 0, launchViews: 0, feedImpressions: 0, websiteClicks: 0, whatsappClicks: 0, calls: 0, emails: 0, directions: 0, quoteRequests: 0, demoBookings: 0, storeVisits: 0, productClicks: 0, saves: 0, likes: 0, shares: 0 }; }
