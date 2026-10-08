import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { assertCategory, assertOwnedAsset, ensureOwnerBrand, ensureOwnerLaunch, parse, requireBrandReady, requireLaunchReady } from '../lib/domain.js';
import { getLaunchOwner } from '../lib/serializers.js';
import { launchFieldsSchema, publishScheduleSchema } from '../validation.js';
import { notifyLaunchAudience } from '../lib/launch-notifications.js';

const now = () => new Date().toISOString();
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const columns = {
  title: 'title', launchType: 'launch_type', category: 'category', summary: 'summary', story: 'story', launchDate: 'launch_date', launchAt: 'launch_at', endsAt: 'ends_at',
  availabilityNote: 'availability_note', priceInrPaise: 'price_inr_paise', websiteUrl: 'website_url', instagramUrl: 'instagram_url',
  whatsappUrl: 'whatsapp_url', leaderboardOptOut: 'leaderboard_opt_out'
};

function profileForOwner(db, userId) { return db.prepare('SELECT id FROM founder_profiles WHERE user_id = ?').get(userId); }
function validateAssociations(db, userId, founderIds) {
  if (!founderIds?.length) return;
  const profile = profileForOwner(db, userId);
  if (new Set(founderIds).size !== founderIds.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Founder attribution IDs must be unique.', { founderIds: 'Remove duplicate founder IDs.' });
  const rows = db.prepare(`SELECT id, public_profile FROM founder_profiles WHERE id IN (${founderIds.map(() => '?').join(',')})`).all(...founderIds);
  if (rows.length !== new Set(founderIds).size || rows.some(row => !row.public_profile && row.id !== profile?.id)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Only your profile and public founder profiles can be attributed.', { founderIds: 'Remove unavailable founder profiles.' });
  }
}

function replaceAssociations(db, launchId, founderIds) {
  db.prepare('DELETE FROM launch_founders WHERE launch_id = ?').run(launchId);
  const insert = db.prepare('INSERT INTO launch_founders(launch_id, founder_profile_id, position) VALUES (?, ?, ?)');
  founderIds.forEach((id, index) => insert.run(launchId, id, index));
}

function replaceImages(db, userId, launchId, images, config) {
  for (const [index, image] of images.entries()) assertOwnedAsset(db, userId, image.url, 'launch-carousel', config, `images.${index}.url`);
  db.prepare('DELETE FROM launch_images WHERE launch_id = ?').run(launchId);
  const insert = db.prepare('INSERT INTO launch_images(id, launch_id, asset_id, url, alt_text, position) VALUES (?, ?, ?, ?, ?, ?)');
  images.forEach((image, index) => insert.run(randomUUID(), launchId, image.url.match(/\/api\/media\/([0-9a-f-]{36})/i)[1], image.url, image.altText, index));
}

function parseLaunchStatus(value, defaultValue) {
  const status = value ?? defaultValue;
  if (!['draft', 'published'].includes(status)) throw new ApiError(422, 'VALIDATION_ERROR', 'A launch may be created as a draft or published.', { status: 'Use draft or published.' });
  return status;
}

function launchForm(db, row) {
  const result = getLaunchOwner(db, row);
  result.images = db.prepare('SELECT url, alt_text AS altText FROM launch_images WHERE launch_id = ? ORDER BY position').all(row.id);
  result.founderIds = db.prepare('SELECT founder_profile_id FROM launch_founders WHERE launch_id = ? ORDER BY position').all(row.id).map(item => item.founder_profile_id);
  const scheduled = db.prepare('SELECT publish_at AS scheduledAt FROM scheduled_publications WHERE launch_id = ?').get(row.id);
  if (scheduled) result.scheduledAt = scheduled.scheduledAt;
  return result;
}

function publicPublishChecks(db, userId, launch, brand, config) {
  requireBrandReady(db, userId, brand, config);
  return requireLaunchReady(db, userId, launch, brand, config);
}

function toDomainLaunch(launch) {
  return { ...launch, launch_type: launch.launchType, launch_date: launch.launchDate,
    availability_note: launch.availabilityNote, price_inr_paise: launch.priceInrPaise,
    website_url: launch.websiteUrl, instagram_url: launch.instagramUrl, whatsapp_url: launch.whatsappUrl,
    leaderboard_opt_out: Number(Boolean(launch.leaderboardOptOut)) };
}

export function createLaunchRouter({ db, auth, config }) {
  const router = Router();

  router.get('/me/brands/:id/launches', auth.requireAuth, (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    const items = db.prepare('SELECT * FROM launches WHERE brand_id = ? AND owner_user_id = ? ORDER BY updated_at DESC').all(brand.id, req.user.id)
      .map(row => launchForm(db, row));
    return res.json({ items });
  });

  router.post('/me/brands/:id/launches', auth.requireAuth, (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    const input = parse(launchFieldsSchema, req.body?.launch ?? {});
    if (input.brandId && input.brandId !== brand.id) throw new ApiError(422, 'VALIDATION_ERROR', 'Launch brand does not match the route.', { brandId: 'Choose this brand.' });
    if (input.category) assertCategory(db, input.category);
    const status = parseLaunchStatus(req.body?.status, 'published');
    if (status === 'published' && !req.user.emailVerified) throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before publishing.');
    const profile = profileForOwner(db, req.user.id);
    const founderIds = input.founderIds ?? (profile ? [profile.id] : []);
    validateAssociations(db, req.user.id, founderIds);
    const launch = {
      title: input.title ?? null, launch_type: input.launchType ?? null, category: input.category ?? null,
      summary: input.summary ?? null, story: input.story ?? null, images: input.images ?? [], founderIds,
      launch_date: input.launchDate ?? null, launch_at: input.launchAt ?? null, ends_at: input.endsAt ?? null, availability_note: input.availabilityNote ?? null,
      price_inr_paise: input.priceInrPaise ?? null, website_url: input.websiteUrl ?? null,
      instagram_url: input.instagramUrl ?? null, whatsapp_url: input.whatsappUrl ?? null,
      leaderboard_opt_out: input.leaderboardOptOut ? 1 : 0
    };
    if (status === 'published') publicPublishChecks(db, req.user.id, launch, brand, config);
    else for (const [index, image] of launch.images.entries()) assertOwnedAsset(db, req.user.id, image.url, 'launch-carousel', config, `images.${index}.url`);
    const id = randomUUID(), time = now();
    db.prepare(`INSERT INTO launches(id, brand_id, owner_user_id, slug, title, launch_type, category, summary, story, launch_date, launch_at, ends_at,
      availability_note, price_inr_paise, website_url, instagram_url, whatsapp_url, leaderboard_opt_out, status, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, brand.id, req.user.id, `${(input.title ?? brand.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'launch'}-${id.slice(0, 8)}`,
        launch.title, launch.launch_type, launch.category, launch.summary, launch.story, launch.launch_date, launch.launch_at, launch.ends_at,
        launch.availability_note, launch.price_inr_paise, launch.website_url, launch.instagram_url, launch.whatsapp_url,
        launch.leaderboard_opt_out, status, status === 'published' ? time : null, time, time);
    replaceAssociations(db, id, founderIds);
    replaceImages(db, req.user.id, id, launch.images, config);
    if (status === 'published') notifyLaunchAudience(db, id, brand.id, founderIds, launch.title ?? brand.name);
    return res.status(201).json({ item: launchForm(db, db.prepare('SELECT * FROM launches WHERE id = ?').get(id)) });
  });

  router.patch('/me/launches/:id', auth.requireAuth, (req, res) => {
    const current = ensureOwnerLaunch(db, req.user.id, req.params.id);
    if (current.status === 'removed') throw new ApiError(409, 'CONFLICT', 'Removed content can only be restored by a moderator.');
    const input = parse(launchFieldsSchema, req.body?.launch ?? {});
    if (input.category) assertCategory(db, input.category);
    const nextBrand = input.brandId && input.brandId !== current.brand_id ? ensureOwnerBrand(db, req.user.id, input.brandId) : ensureOwnerBrand(db, req.user.id, current.brand_id);
    const currentForm = launchForm(db, current);
    const merged = { ...currentForm, ...Object.fromEntries(Object.entries(input).filter(([key]) => !['brandId', 'founderIds', 'images'].includes(key))) };
    merged.brandId = nextBrand.id;
    merged.images = has(input, 'images') ? (input.images ?? []) : currentForm.images;
    merged.founderIds = has(input, 'founderIds') ? (input.founderIds ?? []) : currentForm.founderIds;
    if (merged.launchAt && merged.endsAt && Date.parse(merged.endsAt) <= Date.parse(merged.launchAt)) throw new ApiError(422, 'VALIDATION_ERROR', 'Ending time must follow the scheduled launch time.', { endsAt: 'Choose a later ending time.' });
    validateAssociations(db, req.user.id, merged.founderIds);
    if (current.status === 'published') {
      if (!req.user.emailVerified) throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before publishing.');
      publicPublishChecks(db, req.user.id, toDomainLaunch(merged), nextBrand, config);
    } else for (const [index, image] of merged.images.entries()) assertOwnedAsset(db, req.user.id, image.url, 'launch-carousel', config, `images.${index}.url`);
    const dbValues = {};
    for (const [key, column] of Object.entries(columns)) {
      if (key === 'leaderboardOptOut') dbValues[column] = Number(Boolean(merged[key]));
      else dbValues[column] = key === 'leaderboardOptOut' ? Number(Boolean(merged[key])) : merged[key] ?? null;
    }
    db.prepare(`UPDATE launches SET brand_id = ?, title = ?, launch_type = ?, category = ?, summary = ?, story = ?, launch_date = ?, launch_at = ?, ends_at = ?,
      availability_note = ?, price_inr_paise = ?, website_url = ?, instagram_url = ?, whatsapp_url = ?, leaderboard_opt_out = ?, updated_at = ? WHERE id = ?`)
      .run(nextBrand.id, dbValues.title, dbValues.launch_type, dbValues.category, dbValues.summary, dbValues.story, dbValues.launch_date, dbValues.launch_at, dbValues.ends_at,
        dbValues.availability_note, dbValues.price_inr_paise, dbValues.website_url, dbValues.instagram_url, dbValues.whatsapp_url,
        dbValues.leaderboard_opt_out, now(), current.id);
    if (has(input, 'founderIds')) replaceAssociations(db, current.id, merged.founderIds);
    if (has(input, 'images')) replaceImages(db, req.user.id, current.id, merged.images, config);
    db.prepare('DELETE FROM scheduled_publications WHERE launch_id = ?').run(current.id);
    return res.json({ item: launchForm(db, db.prepare('SELECT * FROM launches WHERE id = ?').get(current.id)) });
  });

  router.post('/me/launches/:id/schedule', auth.requireVerified, (req, res) => {
    const launchRow = ensureOwnerLaunch(db, req.user.id, req.params.id);
    if (launchRow.status !== 'draft' || launchRow.moderation_locked) throw new ApiError(409, 'CONFLICT', 'Only an unlocked draft launch can be scheduled.');
    const { publishAt } = parse(publishScheduleSchema, req.body ?? {});
    const publishTime = new Date(publishAt);
    if (publishTime <= new Date()) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a publication time in the future.', { publishAt: 'Choose a future time.' });
    const brand = ensureOwnerBrand(db, req.user.id, launchRow.brand_id);
    const launch = launchForm(db, launchRow);
    publicPublishChecks(db, req.user.id, toDomainLaunch(launch), brand, config);
    const scheduledAt = publishTime.toISOString();
    db.prepare(`INSERT INTO scheduled_publications(id, launch_id, publish_at, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(launch_id) DO UPDATE SET publish_at = excluded.publish_at, created_at = excluded.created_at`)
      .run(randomUUID(), launchRow.id, scheduledAt, now());
    return res.status(202).json({ item: launchForm(db, db.prepare('SELECT * FROM launches WHERE id = ?').get(launchRow.id)) });
  });

  router.delete('/me/launches/:id/schedule', auth.requireAuth, (req, res) => {
    const launch = ensureOwnerLaunch(db, req.user.id, req.params.id);
    db.prepare('DELETE FROM scheduled_publications WHERE launch_id = ?').run(launch.id);
    return res.status(204).end();
  });

  router.post('/me/launches/:id/publish', auth.requireVerified, (req, res) => {
    const launchRow = ensureOwnerLaunch(db, req.user.id, req.params.id);
    if (launchRow.status === 'removed' || launchRow.moderation_locked) throw new ApiError(409, 'CONFLICT', 'This launch can only be restored by a moderator.');
    const brand = ensureOwnerBrand(db, req.user.id, launchRow.brand_id);
    const launch = launchForm(db, launchRow);
    publicPublishChecks(db, req.user.id, toDomainLaunch(launch), brand, config);
    const time = now();
    db.prepare("UPDATE launches SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?").run(time, time, launchRow.id);
    db.prepare('DELETE FROM scheduled_publications WHERE launch_id = ?').run(launchRow.id);
    notifyLaunchAudience(db, launchRow.id, brand.id, launch.founderIds, launch.title ?? brand.name);
    return res.json({ item: launchForm(db, db.prepare('SELECT * FROM launches WHERE id = ?').get(launchRow.id)) });
  });

  router.post('/me/launches/:id/pause', auth.requireAuth, (req, res) => {
    const launch = ensureOwnerLaunch(db, req.user.id, req.params.id);
    if (launch.moderation_locked || launch.status !== 'published') throw new ApiError(409, 'CONFLICT', 'Only an unlocked published launch can be paused.');
    db.prepare("UPDATE launches SET status = 'paused', updated_at = ? WHERE id = ?").run(now(), launch.id);
    db.prepare('DELETE FROM scheduled_publications WHERE launch_id = ?').run(launch.id);
    return res.json({ item: launchForm(db, db.prepare('SELECT * FROM launches WHERE id = ?').get(launch.id)) });
  });

  router.post('/me/launches/:id/archive', auth.requireAuth, (req, res) => {
    const launch = ensureOwnerLaunch(db, req.user.id, req.params.id);
    if (launch.status === 'removed' || launch.moderation_locked) throw new ApiError(409, 'CONFLICT', 'This launch can only be restored by a moderator.');
    db.prepare("UPDATE launches SET status = 'archived', updated_at = ? WHERE id = ?").run(now(), launch.id);
    db.prepare('DELETE FROM scheduled_publications WHERE launch_id = ?').run(launch.id);
    return res.json({ item: launchForm(db, db.prepare('SELECT * FROM launches WHERE id = ?').get(launch.id)) });
  });

  return router;
}
