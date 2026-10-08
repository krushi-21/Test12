import { Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { pageArgs, pageResult } from '../lib/pagination.js';
import { localDay, periodBounds } from '../lib/time.js';
import { addEvent, holdOnClickBurst } from '../lib/events.js';
import { loadPublicBrand, loadPublicFounder, loadPublicLaunch } from '../lib/serializers.js';
import { makeLimiter } from '../lib/rate-limit.js';
import { addBusinessEvent } from '../lib/business-events.js';

const launchTypes = [
  { id: 'business', name: 'Business' }, { id: 'product', name: 'Product' }, { id: 'service', name: 'Service' }
];
const validKinds = new Set(['website', 'instagram', 'whatsapp']);
const likePattern = value => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

export function createPublicRouter({ db, config, auth }) {
  const router = Router();
  router.use(auth.optionalAuth);
  const engagementLimit = makeLimiter({ windowMs: 60_000, limit: 90, message: 'Too many engagement requests. Please wait a moment.' });
  const redirectLimit = makeLimiter({ windowMs: 60_000, limit: 45, message: 'Too many outbound requests. Please wait a moment.' });

  router.get('/health', (_req, res) => res.json({ status: 'ok' }));
  router.get('/categories', (_req, res) => {
    const categories = db.prepare('SELECT id, name FROM categories WHERE active = 1 ORDER BY sort_order').all().map(row => ({ ...row, slug: row.id }));
    res.json({ categories, launchTypes });
  });

  router.get('/categories/popular', (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const rows = db.prepare(`SELECT c.id, c.name, c.id AS slug, COUNT(DISTINCT l.id) AS launchCount
      FROM categories c LEFT JOIN launches l ON l.category = c.id AND l.status = 'published'
        AND EXISTS (SELECT 1 FROM brands b WHERE b.id = l.brand_id AND b.status = 'published')
      WHERE c.active = 1 GROUP BY c.id HAVING COUNT(DISTINCT l.id) > 0
      ORDER BY launchCount DESC, c.sort_order ASC LIMIT ? OFFSET ?`).all(limit + 1, offset);
    const page = pageResult(rows, limit, offset);
    return res.json({ categories: page.items, nextCursor: page.nextCursor });
  });

  router.get('/launches', (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const where = ["l.status = 'published'", "b.status = 'published'"];
    const values = [];
    const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 120) : '';
    if (query) {
      where.push(`(l.title LIKE ? COLLATE NOCASE OR b.name LIKE ? COLLATE NOCASE OR EXISTS (
        SELECT 1 FROM launch_founders lf JOIN founder_profiles fp ON fp.id = lf.founder_profile_id
        WHERE lf.launch_id = l.id AND fp.public_profile = 1 AND fp.display_name LIKE ? COLLATE NOCASE))`);
      const term = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
      values.push(term, term, term);
    }
    for (const [key, column] of [['category', 'l.category'], ['launchType', 'l.launch_type']]) {
      if (typeof req.query[key] === 'string' && req.query[key]) {
        if (key === 'category' && !db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(req.query[key])) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an available category.', { category: 'This category is not available.' });
        if (key === 'launchType' && !['business', 'product', 'service'].includes(req.query[key])) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a launch type.', { launchType: 'This launch type is not available.' });
        where.push(`${column} = ?`); values.push(req.query[key]);
      }
    }
    for (const [key, column] of [['city', 'b.city'], ['state', 'b.state']]) {
      if (typeof req.query[key] === 'string' && req.query[key].trim()) { where.push(`${column} LIKE ? COLLATE NOCASE`); values.push(`%${req.query[key].trim().slice(0, 80)}%`); }
    }
    if (typeof req.query.area === 'string' && req.query.area.trim()) { where.push('b.area LIKE ? COLLATE NOCASE'); values.push(`%${req.query.area.trim().slice(0, 100)}%`); }
    if (req.query.mode !== undefined) {
      if (!['online', 'physical', 'hybrid'].includes(req.query.mode)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose online, physical, or hybrid.', { mode: 'Unsupported business mode.' });
      where.push('b.business_mode = ?'); values.push(req.query.mode);
    }
    if (req.query.verified === 'true') where.push('EXISTS (SELECT 1 FROM users u WHERE u.id = b.owner_user_id AND u.email_verified_at IS NOT NULL)');
    if (req.query.verified !== undefined && !['true', 'false'].includes(String(req.query.verified))) throw new ApiError(422, 'VALIDATION_ERROR', 'verified must be true or false.', { verified: 'Use true or false.' });
    if (req.query.newlyLaunched === 'true') where.push("l.published_at >= datetime('now', '-30 days')");
    if (req.query.newlyLaunched !== undefined && !['true', 'false'].includes(String(req.query.newlyLaunched))) throw new ApiError(422, 'VALIDATION_ERROR', 'newlyLaunched must be true or false.', { newlyLaunched: 'Use true or false.' });
    const priceMin = req.query.priceMin == null ? undefined : Number(req.query.priceMin);
    const priceMax = req.query.priceMax == null ? undefined : Number(req.query.priceMax);
    if (priceMin !== undefined && (!Number.isInteger(priceMin) || priceMin < 0)) throw new ApiError(422, 'VALIDATION_ERROR', 'priceMin must be a non-negative integer in INR paise.', { priceMin: 'Use integer INR paise.' });
    if (priceMax !== undefined && (!Number.isInteger(priceMax) || priceMax < 0)) throw new ApiError(422, 'VALIDATION_ERROR', 'priceMax must be a non-negative integer in INR paise.', { priceMax: 'Use integer INR paise.' });
    if (priceMin !== undefined) { where.push('l.price_inr_paise >= ?'); values.push(priceMin); }
    if (priceMax !== undefined) { where.push('l.price_inr_paise <= ?'); values.push(priceMax); }
    if (typeof req.query.availability === 'string' && req.query.availability.trim()) { where.push('l.availability_note LIKE ? COLLATE NOCASE'); values.push(`%${req.query.availability.trim().slice(0, 80)}%`); }

    const sort = req.query.sort ?? 'new';
    if (!['new', 'trending', 'most_saved', 'most_liked'].includes(sort)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose new, trending, most_saved, or most_liked.', { sort: 'Unsupported sort.' });
    let orderSql = 'l.published_at DESC, l.id ASC';
    let orderValues = [];
    if (sort === 'trending') {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      orderSql = `(
        SELECT COUNT(*) FROM engagement_events x WHERE x.launch_id = l.id AND x.event_type = 'like' AND x.qualified = 1 AND x.retracted_at IS NULL AND x.created_at >= ?
      ) + 2 * (
        SELECT COUNT(*) FROM engagement_events x WHERE x.launch_id = l.id AND x.event_type = 'save' AND x.qualified = 1 AND x.retracted_at IS NULL AND x.created_at >= ?
      ) + 3 * (
        SELECT COUNT(*) FROM engagement_events x WHERE x.launch_id = l.id AND x.event_type = 'click_out' AND x.qualified = 1 AND x.created_at >= ?
      ) DESC, l.published_at DESC, l.id ASC`;
      orderValues = [since, since, since];
    } else if (sort === 'most_saved') {
      orderSql = `(SELECT COUNT(*) FROM saves x WHERE x.launch_id = l.id) DESC, l.published_at DESC, l.id ASC`;
    } else if (sort === 'most_liked') {
      orderSql = `(SELECT COUNT(*) FROM likes x WHERE x.launch_id = l.id) DESC, l.published_at DESC, l.id ASC`;
    }
    const rows = db.prepare(`SELECT l.id, l.owner_user_id, l.brand_id FROM launches l JOIN brands b ON b.id = l.brand_id
      WHERE ${where.join(' AND ')} ORDER BY ${orderSql} LIMIT ? OFFSET ?`).all(...values, ...orderValues, limit + 1, offset);
    const visibleRows = rows.slice(0, limit);
    if (!config.previewReadOnly) {
      const surface = typeof req.query.source === 'string' && ['direct', 'search', 'following', 'collection', 'trending', 'nearby', 'external'].includes(req.query.source) ? req.query.source : 'search';
      for (const row of visibleRows) addEvent(db, req, req.user, row, config, 'impression', { dedupeMinutes: 30, source: surface });
    }
    const result = pageResult(rows.map(row => loadPublicLaunch(db, row.id, req.user)), limit, offset);
    res.json(result);
  });

  router.get('/launches/:idOrSlug/outbound/:kind', redirectLimit, (req, res) => {
    if (config.previewReadOnly) throw new ApiError(403, 'DEMO_READ_ONLY', 'Outbound redirects are disabled in preview mode.');
    const { idOrSlug, kind } = req.params;
    if (!validKinds.has(kind)) throw new ApiError(404, 'NOT_FOUND', 'This destination is unavailable.');
    const launch = db.prepare(`SELECT l.*, b.website_url AS brand_website_url, b.instagram_url AS brand_instagram_url,
      b.whatsapp_url AS brand_whatsapp_url, b.status AS brand_status
      FROM launches l JOIN brands b ON b.id = l.brand_id
      WHERE (l.id = ? OR l.slug = ?) AND l.status = 'published' AND b.status = 'published'`).get(idOrSlug, idOrSlug);
    if (!launch) throw new ApiError(404, 'NOT_FOUND', 'This launch is unavailable.');
    const target = launch[`${kind}_url`] || launch[`brand_${kind}_url`];
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'This destination is unavailable.');
    const verified = req.user?.emailVerified ? req.user : null;
    let qualified = false;
    if (verified && verified.id !== launch.owner_user_id) {
      const prior = db.prepare(`SELECT 1 FROM engagement_events WHERE event_type = 'click_out' AND launch_id = ? AND actor_user_id = ?
        AND destination = ? AND local_day = ? AND qualified = 1`).get(launch.id, verified.id, kind, localDay());
      qualified = !prior;
    }
    const event = addEvent(db, req, req.user, launch, config, 'click_out', { destination: kind, qualified, source: req.query.source, dedupeMinutes: 30 });
    if (event && qualified) {
      const count = holdOnClickBurst(db, launch, config);
      if (count >= config.suspiciousClickThreshold) {
        // A held entry is intentionally omitted from rankings until a moderator reviews the burst.
      }
    }
    return res.redirect(302, target);
  });

  router.post('/launches/:idOrSlug/share', engagementLimit, (req, res) => {
    if (config.previewReadOnly) throw new ApiError(403, 'DEMO_READ_ONLY', 'Share events are disabled in preview mode.');
    const launch = db.prepare(`SELECT l.* FROM launches l JOIN brands b ON b.id = l.brand_id
      WHERE (l.id = ? OR l.slug = ?) AND l.status = 'published' AND b.status = 'published'`).get(req.params.idOrSlug, req.params.idOrSlug);
    if (!launch) throw new ApiError(404, 'NOT_FOUND', 'This launch is unavailable.');
    addEvent(db, req, req.user, launch, config, 'share', { dedupeMinutes: 30, source: req.body?.source });
    return res.status(202).json({ accepted: true });
  });

  router.get('/launches/:idOrSlug', (req, res) => {
    const item = loadPublicLaunch(db, req.params.idOrSlug, req.user);
    const eventLaunch = db.prepare('SELECT id, brand_id, owner_user_id FROM launches WHERE id = ?').get(item.id);
    if (!config.previewReadOnly) addEvent(db, req, req.user, eventLaunch, config, 'detail_view', { dedupeMinutes: 30, source: req.query.source });
    return res.json({ item });
  });

  router.get('/brands/:slug', (req, res) => {
    const brand = db.prepare("SELECT id, owner_user_id FROM brands WHERE slug = ? AND status = 'published'").get(req.params.slug);
    if (!brand) throw new ApiError(404, 'NOT_FOUND', 'This brand page is unavailable.');
    if (!config.previewReadOnly) addBusinessEvent(db, req, req.user, brand, 'profile_view', config, { source: req.query.source ?? 'direct' });
    const item = loadPublicBrand(db, req.params.slug, req.user?.id);
    return res.json({ item: { ...item, viewerIsOwner: req.user?.id === brand.owner_user_id } });
  });
  router.get('/founders', (req, res) => {
    const { limit, offset } = pageArgs(req.query);
    const where = ["fp.public_profile = 1", "fp.moderation_status = 'active'"];
    const values = [];
    const query = typeof req.query.query === 'string' ? req.query.query.trim().slice(0, 120) : '';
    if (query) {
      const pattern = likePattern(query);
      where.push(`(fp.display_name LIKE ? COLLATE NOCASE ESCAPE char(92) OR fp.bio LIKE ? COLLATE NOCASE ESCAPE char(92) OR
        fp.role LIKE ? COLLATE NOCASE ESCAPE char(92) OR fp.city LIKE ? COLLATE NOCASE ESCAPE char(92) OR
        fp.state LIKE ? COLLATE NOCASE ESCAPE char(92) OR EXISTS (
          SELECT 1 FROM founder_public_brands fpb JOIN brands b ON b.id = fpb.brand_id
          WHERE fpb.founder_profile_id = fp.id AND b.status = 'published' AND b.name LIKE ? COLLATE NOCASE ESCAPE char(92)))`);
      values.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }
    for (const [key, column] of [['city', 'fp.city'], ['state', 'fp.state']]) {
      if (typeof req.query[key] === 'string' && req.query[key].trim()) {
        where.push(`${column} LIKE ? COLLATE NOCASE`);
        values.push(`%${req.query[key].trim().slice(0, 80)}%`);
      }
    }
    const rows = db.prepare(`SELECT fp.id, fp.slug, fp.display_name AS displayName, fp.avatar_url AS avatarUrl,
        fp.bio, fp.city, fp.state, fp.role,
        (SELECT COUNT(*) FROM founder_public_brands fpb JOIN brands b ON b.id = fpb.brand_id
          WHERE fpb.founder_profile_id = fp.id AND b.status = 'published') AS brandCount
      FROM founder_profiles fp WHERE ${where.join(' AND ')}
      ORDER BY fp.display_name COLLATE NOCASE, fp.id LIMIT ? OFFSET ?`)
      .all(...values, limit + 1, offset);
    const items = rows.map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)));
    return res.json(pageResult(items, limit, offset));
  });

  router.get('/founders/:idOrSlug', (req, res) => res.json({ item: loadPublicFounder(db, req.params.idOrSlug) }));

  router.get('/leaderboard', (req, res) => {
    const period = req.query.period ?? 'weekly';
    if (!['weekly', 'monthly'].includes(period)) throw new ApiError(422, 'VALIDATION_ERROR', 'period must be weekly or monthly.', { period: 'Use weekly or monthly.' });
    const { limit, offset } = pageArgs(req.query);
    const bounds = periodBounds(period === 'weekly' ? 'weekly' : 'monthly');
    const where = ["l.status = 'published'", "b.status = 'published'", 'l.leaderboard_opt_out = 0',
      'NOT EXISTS (SELECT 1 FROM leaderboard_holds h WHERE h.launch_id = l.id AND h.resolved_at IS NULL)'];
    const params = [];
    if (typeof req.query.category === 'string' && req.query.category) {
      if (!db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(req.query.category)) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an available category.', { category: 'This category is not available.' });
      where.push('l.category = ?'); params.push(req.query.category);
    }
    const eligibleCount = db.prepare(`SELECT COUNT(*) AS n FROM launches l JOIN brands b ON b.id = l.brand_id WHERE ${where.join(' AND ')}`).get(...params).n;
    if (eligibleCount < 5) return res.json({ period, timezone: 'Asia/Kolkata', periodStart: bounds.start, periodEnd: bounds.end,
      scoreFormula: { status: 'provisional', like: 1, save: 2, clickOut: 3, tieBreak: 'Equal scores share rank; earlier publication is displayed first.' },
      eligibleCount, forming: true, items: [], nextCursor: null });
    const ranked = db.prepare(`WITH scored AS (
      SELECT l.id,
      (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'like' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ? AND e.created_at < ?) +
      2 * (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'save' AND e.qualified = 1 AND e.retracted_at IS NULL AND e.created_at >= ? AND e.created_at < ?) +
      3 * (SELECT COUNT(*) FROM engagement_events e WHERE e.launch_id = l.id AND e.event_type = 'click_out' AND e.qualified = 1 AND e.created_at >= ? AND e.created_at < ?) AS score,
      l.published_at, l.slug
      FROM launches l JOIN brands b ON b.id = l.brand_id WHERE ${where.join(' AND ')}
    ), ranked AS (SELECT id, score, published_at, slug, RANK() OVER (ORDER BY score DESC) AS rank FROM scored)
      SELECT id, score, published_at, slug, rank FROM ranked
      ORDER BY score DESC, published_at ASC, slug ASC LIMIT ? OFFSET ?`)
      .all(bounds.start, bounds.end, bounds.start, bounds.end, bounds.start, bounds.end, ...params, limit + 1, offset);
    const rows = ranked.slice(0, limit);
    if (!config.previewReadOnly) for (const row of rows) {
      const launch = db.prepare('SELECT id, brand_id, owner_user_id FROM launches WHERE id = ?').get(row.id);
      addEvent(db, req, req.user, launch, config, 'impression', { dedupeMinutes: 30, source: 'trending' });
    }
    const items = rows.map(row => ({ rank: row.rank, score: row.score, launch: loadPublicLaunch(db, row.id, req.user) }));
    res.json({ period, timezone: 'Asia/Kolkata', periodStart: bounds.start, periodEnd: bounds.end,
      scoreFormula: { status: 'provisional', like: 1, save: 2, clickOut: 3, tieBreak: 'Equal scores share rank; earlier publication is displayed first.' },
      eligibleCount, forming: false, items, nextCursor: ranked.length > limit ? Buffer.from(String(offset + limit)).toString('base64url') : null });
  });

  router.get('/businesses/leaderboard', (req, res) => {
    const period = req.query.period ?? 'monthly';
    if (!['weekly', 'monthly'].includes(period)) throw new ApiError(422, 'VALIDATION_ERROR', 'period must be weekly or monthly.', { period: 'Use weekly or monthly.' });
    const { limit, offset } = pageArgs(req.query);
    const bounds = periodBounds(period);
    const where = ["b.status = 'published'", "l.status = 'published'", 'l.leaderboard_opt_out = 0'];
    const values = [];
    if (typeof req.query.category === 'string' && req.query.category) {
      if (!db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(req.query.category)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an available category.', { category: 'This category is not available.' });
      }
      where.push('l.category = ?');
      values.push(req.query.category);
    }
    const eligibleCount = db.prepare(`SELECT COUNT(DISTINCT b.id) AS n FROM brands b JOIN launches l ON l.brand_id = b.id
      WHERE ${where.join(' AND ')}`).get(...values).n;
    const rows = db.prepare(`WITH scored AS (
        SELECT b.id, b.slug, b.name, b.logo_url AS logoUrl, b.category, b.city, b.state,
          COUNT(DISTINCT l.id) AS launchCount,
          COALESCE(SUM(CASE
            WHEN e.event_type = 'like' AND e.retracted_at IS NULL THEN 1
            WHEN e.event_type = 'save' AND e.retracted_at IS NULL THEN 2
            WHEN e.event_type = 'click_out' THEN 3
            ELSE 0 END), 0) AS score
        FROM brands b JOIN launches l ON l.brand_id = b.id
        LEFT JOIN engagement_events e ON e.launch_id = l.id AND e.qualified = 1
          AND e.created_at >= ? AND e.created_at < ? AND e.event_type IN ('like', 'save', 'click_out')
        WHERE ${where.join(' AND ')} GROUP BY b.id
      )
      SELECT *, RANK() OVER (ORDER BY score DESC) AS rank FROM scored
      ORDER BY score DESC, name COLLATE NOCASE, id LIMIT ? OFFSET ?`)
      .all(bounds.start, bounds.end, ...values, limit + 1, offset);
    const page = pageResult(rows.map(row => ({ rank: row.rank, score: row.score,
      business: Object.fromEntries(Object.entries({ id: row.id, slug: row.slug, name: row.name, logoUrl: row.logoUrl,
        category: row.category, city: row.city, state: row.state, launchCount: row.launchCount })
        .filter(([, value]) => value !== null)) })), limit, offset);
    return res.json({ period, timezone: 'Asia/Kolkata', periodStart: bounds.start, periodEnd: bounds.end,
      scoreFormula: { status: 'provisional', like: 1, save: 2, clickOut: 3,
        tieBreak: 'Equal scores share rank; business name then ID orders tied entries.' },
      eligibleCount, items: page.items, nextCursor: page.nextCursor });
  });

  return router;
}
