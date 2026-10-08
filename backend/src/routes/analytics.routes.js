import { Router } from 'express';
import { ApiError } from '../lib/errors.js';
import { localDay } from '../lib/time.js';

const fields = ['impressions', 'detailViews', 'likes', 'saves', 'shares', 'clickOuts'];
const eventToField = { impression: 'impressions', detail_view: 'detailViews', like: 'likes', save: 'saves', share: 'shares', click_out: 'clickOuts' };
function rangeStart(days, today) {
  const [year, month, day] = today.split('-').map(Number);
  const localMidnight = Date.UTC(year, month - 1, day - (days - 1));
  return new Date(localMidnight - 330 * 60_000).toISOString();
}
function daySequence(days, today) {
  const [year, month, day] = today.split('-').map(Number);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day - (days - index - 1)));
    return date.toISOString().slice(0, 10);
  });
}

export function createAnalyticsRouter({ db, auth }) {
  const router = Router();
  router.get('/me/analytics', auth.requireAuth, (req, res) => {
    const range = req.query.range ?? '7d';
    if (!['7d', '30d'].includes(range)) throw new ApiError(422, 'VALIDATION_ERROR', 'range must be 7d or 30d.', { range: 'Use 7d or 30d.' });
    const days = range === '30d' ? 30 : 7;
    const filters = [];
    const params = [];
    if (req.query.brandId) {
      const brand = db.prepare('SELECT id FROM brands WHERE id = ? AND owner_user_id = ?').get(req.query.brandId, req.user.id);
      if (!brand) throw new ApiError(404, 'NOT_FOUND', 'Brand not found.');
      filters.push('e.brand_id = ?'); params.push(brand.id);
    }
    if (req.query.launchId) {
      const launch = db.prepare('SELECT id FROM launches WHERE (id = ? OR slug = ?) AND owner_user_id = ?').get(req.query.launchId, req.query.launchId, req.user.id);
      if (!launch) throw new ApiError(404, 'NOT_FOUND', 'Launch not found.');
      filters.push('e.launch_id = ?'); params.push(launch.id);
    }
    const today = localDay();
    const start = rangeStart(days, today);
    const sql = `SELECT e.local_day, e.event_type, COUNT(*) AS n FROM engagement_events e
      JOIN launches l ON l.id = e.launch_id WHERE l.owner_user_id = ? AND e.created_at >= ?
      AND e.retracted_at IS NULL ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
      GROUP BY e.local_day, e.event_type`;
    const rows = db.prepare(sql).all(req.user.id, start, ...params);
    const byDay = new Map(daySequence(days, today).map(day => [day, Object.fromEntries(fields.map(field => [field, 0]))]));
    for (const row of rows) {
      const field = eventToField[row.event_type];
      if (field && byDay.has(row.local_day)) byDay.get(row.local_day)[field] = row.n;
    }
    const series = [...byDay.entries()].map(([date, values]) => ({ date, ...values }));
    const totals = Object.fromEntries(fields.map(field => [field, series.reduce((sum, day) => sum + day[field], 0)]));
    return res.json({ range, totals, series });
  });
  return router;
}
