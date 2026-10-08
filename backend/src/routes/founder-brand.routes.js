import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../lib/errors.js';
import { parse, assertCategory, assertOwnedAsset, ensureOwnerBrand, requireBrandReady } from '../lib/domain.js';
import { slugify } from '../lib/slug.js';
import { getBrandOwner, getFounderPrivate } from '../lib/serializers.js';
import { founderProfileSchema, brandFieldsSchema } from '../validation.js';

const profileColumns = {
  displayName: 'display_name', avatarUrl: 'avatar_url', bio: 'bio', city: 'city', state: 'state', role: 'role', instagramUrl: 'instagram_url', publicProfile: 'public_profile'
};
const brandColumns = {
  name: 'name', logoUrl: 'logo_url', description: 'description', category: 'category', websiteUrl: 'website_url',
  instagramUrl: 'instagram_url', whatsappUrl: 'whatsapp_url', tagline: 'tagline', city: 'city', state: 'state', foundedYear: 'founded_year',
  area: 'area', address: 'address', latitude: 'latitude', longitude: 'longitude', openingHours: 'opening_hours', contactPhone: 'contact_phone',
  contactEmail: 'contact_email', quoteUrl: 'quote_url', demoUrl: 'demo_url', storeUrl: 'store_url', businessMode: 'business_mode'
};
const financialColumns = {
  revenueRange: 'revenue_range', revenuePeriod: 'revenue_period', revenuePublic: 'revenue_public',
  fundingRaisedRange: 'funding_raised_range', fundingDate: 'funding_date', fundingType: 'funding_type', fundingPublic: 'funding_public',
  openToFunding: 'open_to_funding', openToFundingPublic: 'open_to_funding_public'
};
const now = () => new Date().toISOString();
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const sqlVal = value => typeof value === 'boolean' ? Number(value) : value ?? null;

function applyPublicBrands(db, profileId, userId, ids) {
  if (ids === undefined) return;
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Brand selections must be unique.', { publicBrandIds: 'Remove duplicate brand IDs.' });
  if (unique.length) {
    const placeholders = unique.map(() => '?').join(',');
    const owned = db.prepare(`SELECT id FROM brands WHERE owner_user_id = ? AND status = 'published' AND id IN (${placeholders})`).all(userId, ...unique);
    if (owned.length !== unique.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Select only your published brands.', { publicBrandIds: 'One or more brands are unavailable.' });
  }
  db.prepare('DELETE FROM founder_public_brands WHERE founder_profile_id = ?').run(profileId);
  const insert = db.prepare('INSERT INTO founder_public_brands(founder_profile_id, brand_id, position) VALUES (?, ?, ?)');
  unique.forEach((id, index) => insert.run(profileId, id, index));
}

function validateFinancial(current, incoming) {
  const merged = { ...current, ...(incoming ?? {}) };
  const fields = {};
  if (merged.revenuePublic && !merged.revenueRange) fields['financial.revenueRange'] = 'Add a range before making revenue public.';
  if (merged.fundingPublic && !merged.fundingRaisedRange) fields['financial.fundingRaisedRange'] = 'Add a range before making funding public.';
  if (merged.openToFundingPublic && merged.openToFunding === undefined) fields['financial.openToFunding'] = 'Choose a value before making funding status public.';
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Complete each field before opting it into public visibility.', fields);
  return merged;
}

export function createFounderBrandRouter({ db, auth, config }) {
  const router = Router();

  router.get('/me', auth.requireAuth, (req, res) => {
    const profile = db.prepare('SELECT * FROM founder_profiles WHERE user_id = ?').get(req.user.id);
    return res.json({ user: { id: req.user.id, displayName: req.user.displayName, email: req.user.email, emailVerified: req.user.emailVerified },
      ...(profile ? { founder: getFounderPrivate(db, profile) } : {}) });
  });

  router.get('/me/founder-profile', auth.requireAuth, (req, res) => {
    const profile = db.prepare('SELECT * FROM founder_profiles WHERE user_id = ?').get(req.user.id);
    return res.json({ item: getFounderPrivate(db, profile) });
  });

  router.post('/me/founder-profile', auth.requireAuth, (req, res) => {
    if (db.prepare('SELECT 1 FROM founder_profiles WHERE user_id = ?').get(req.user.id)) throw new ApiError(409, 'CONFLICT', 'A founder profile already exists. Use PATCH to update it.');
    const input = parse(founderProfileSchema, req.body?.profile ?? {});
    const id = randomUUID();
    const time = now();
    const account = db.prepare('SELECT display_name FROM users WHERE id = ?').get(req.user.id);
    const displayName = input.displayName ?? account.display_name;
    const financial = validateFinancial({}, input.financial);
    const avatarId = assertOwnedAsset(db, req.user.id, input.avatarUrl, 'founder-avatar', config, 'avatarUrl');
    const avatarUrl = avatarId ? input.avatarUrl : null;
    const slug = slugify(displayName);
    db.prepare(`INSERT INTO founder_profiles(id, user_id, slug, display_name, avatar_url, bio, city, state, role, instagram_url,
      public_profile, revenue_range, revenue_period, revenue_public, funding_raised_range, funding_date, funding_type,
      funding_public, open_to_funding, open_to_funding_public, financial_disclosed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.user.id, slug, displayName, avatarUrl, input.bio ?? null, input.city ?? null, input.state ?? null,
        input.role ?? null, input.instagramUrl ?? null, Number(input.publicProfile ?? false), financial.revenueRange ?? null,
        financial.revenuePeriod ?? null, Number(financial.revenuePublic ?? false), financial.fundingRaisedRange ?? null,
        financial.fundingDate ?? null, financial.fundingType ?? null, Number(financial.fundingPublic ?? false),
        financial.openToFunding == null ? null : Number(financial.openToFunding), Number(financial.openToFundingPublic ?? false),
        Object.values(financial).some(v => typeof v === 'boolean' && v) ? time : null, time, time);
    applyPublicBrands(db, id, req.user.id, input.publicBrandIds ?? []);
    return res.status(201).json({ item: getFounderPrivate(db, db.prepare('SELECT * FROM founder_profiles WHERE id = ?').get(id)) });
  });

  router.patch('/me/founder-profile', auth.requireAuth, (req, res) => {
    const profile = db.prepare('SELECT * FROM founder_profiles WHERE user_id = ?').get(req.user.id);
    if (!profile) throw new ApiError(404, 'NOT_FOUND', 'Create a founder profile first.');
    const input = parse(founderProfileSchema, req.body?.profile ?? {});
    const time = now();
    const financialCurrent = {
      revenueRange: profile.revenue_range, revenuePeriod: profile.revenue_period, revenuePublic: Boolean(profile.revenue_public),
      fundingRaisedRange: profile.funding_raised_range, fundingDate: profile.funding_date, fundingType: profile.funding_type,
      fundingPublic: Boolean(profile.funding_public), openToFunding: profile.open_to_funding == null ? undefined : Boolean(profile.open_to_funding),
      openToFundingPublic: Boolean(profile.open_to_funding_public)
    };
    const financial = validateFinancial(financialCurrent, input.financial);
    const setProfile = db.prepare(`UPDATE founder_profiles SET display_name = ?, avatar_url = ?, bio = ?, city = ?, state = ?, role = ?,
      instagram_url = ?, public_profile = ?, revenue_range = ?, revenue_period = ?, revenue_public = ?, funding_raised_range = ?,
      funding_date = ?, funding_type = ?, funding_public = ?, open_to_funding = ?, open_to_funding_public = ?,
      financial_disclosed_at = ?, updated_at = ? WHERE id = ?`);
    const avatarUrl = has(input, 'avatarUrl') ? (input.avatarUrl ?? null) : profile.avatar_url;
    if (has(input, 'avatarUrl') && input.avatarUrl) assertOwnedAsset(db, req.user.id, input.avatarUrl, 'founder-avatar', config, 'avatarUrl');
    const nextDisplayName = input.displayName ?? profile.display_name;
    const hasPublicFinancial = Boolean(financial.revenuePublic || financial.fundingPublic || financial.openToFundingPublic);
    const financialChanged = Object.keys(input.financial ?? {}).length > 0;
    setProfile.run(nextDisplayName, avatarUrl,
      has(input, 'bio') ? input.bio ?? null : profile.bio, has(input, 'city') ? input.city ?? null : profile.city,
      has(input, 'state') ? input.state ?? null : profile.state, has(input, 'role') ? input.role ?? null : profile.role,
      has(input, 'instagramUrl') ? input.instagramUrl ?? null : profile.instagram_url,
      Number(has(input, 'publicProfile') ? input.publicProfile : Boolean(profile.public_profile)),
      financial.revenueRange ?? null, financial.revenuePeriod ?? null, Number(Boolean(financial.revenuePublic)),
      financial.fundingRaisedRange ?? null, financial.fundingDate ?? null, financial.fundingType ?? null, Number(Boolean(financial.fundingPublic)),
      financial.openToFunding == null ? null : Number(financial.openToFunding), Number(Boolean(financial.openToFundingPublic)),
      hasPublicFinancial ? (financialChanged ? time : profile.financial_disclosed_at) : null, time, profile.id);
    applyPublicBrands(db, profile.id, req.user.id, input.publicBrandIds);
    return res.json({ item: getFounderPrivate(db, db.prepare('SELECT * FROM founder_profiles WHERE id = ?').get(profile.id)) });
  });

  router.get('/me/brands', auth.requireAuth, (req, res) => {
    const items = db.prepare('SELECT * FROM brands WHERE owner_user_id = ? ORDER BY updated_at DESC').all(req.user.id).map(row => getBrandOwner(db, row));
    return res.json({ items });
  });

  router.post('/me/brands', auth.requireAuth, (req, res) => {
    const input = parse(brandFieldsSchema, req.body?.brand ?? {});
    if (req.body?.status != null && req.body.status !== 'draft') throw new ApiError(422, 'VALIDATION_ERROR', 'New brands must be created as drafts.', { status: 'Use draft; publish the brand in a separate action.' });
    if (input.category) assertCategory(db, input.category);
    if (input.logoUrl) assertOwnedAsset(db, req.user.id, input.logoUrl, 'brand-logo', config, 'logoUrl');
    const id = randomUUID(), time = now();
    const name = input.name ?? `Draft brand ${id.slice(0, 8)}`;
    db.prepare(`INSERT INTO brands(id, owner_user_id, slug, name, logo_url, description, category, website_url, instagram_url, whatsapp_url,
      tagline, city, state, founded_year, area, address, latitude, longitude, opening_hours, contact_phone, contact_email,
      quote_url, demo_url, store_url, business_mode, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`)
      .run(id, req.user.id, slugify(name), name, input.logoUrl ?? null, input.description ?? null, input.category ?? null,
        input.websiteUrl ?? null, input.instagramUrl ?? null, input.whatsappUrl ?? null, input.tagline ?? null,
        input.city ?? null, input.state ?? null, input.foundedYear ?? null, input.area ?? null, input.address ?? null,
        input.latitude ?? null, input.longitude ?? null, JSON.stringify(input.openingHours ?? {}), input.contactPhone ?? null, input.contactEmail ?? null,
        input.quoteUrl ?? null, input.demoUrl ?? null, input.storeUrl ?? null, input.businessMode ?? 'online', time, time);
    return res.status(201).json({ item: getBrandOwner(db, db.prepare('SELECT * FROM brands WHERE id = ?').get(id)) });
  });

  router.patch('/me/brands/:id', auth.requireAuth, (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    const input = parse(brandFieldsSchema, req.body?.brand ?? {});
    if (input.category) assertCategory(db, input.category);
    if (has(input, 'logoUrl') && input.logoUrl) assertOwnedAsset(db, req.user.id, input.logoUrl, 'brand-logo', config, 'logoUrl');
    const next = { ...brand };
    for (const [key, column] of Object.entries(brandColumns)) if (has(input, key)) next[column] = key === 'openingHours' ? JSON.stringify(input[key] ?? {}) : sqlVal(input[key]);
    if (brand.status === 'published') requireBrandReady(db, req.user.id, next, config);
    db.prepare(`UPDATE brands SET name = ?, logo_url = ?, description = ?, category = ?, website_url = ?, instagram_url = ?, whatsapp_url = ?,
      tagline = ?, city = ?, state = ?, founded_year = ?, area = ?, address = ?, latitude = ?, longitude = ?, opening_hours = ?, contact_phone = ?,
      contact_email = ?, quote_url = ?, demo_url = ?, store_url = ?, business_mode = ?, updated_at = ? WHERE id = ?`)
      .run(next.name, next.logo_url, next.description, next.category, next.website_url, next.instagram_url, next.whatsapp_url,
        next.tagline, next.city, next.state, next.founded_year, next.area, next.address, next.latitude, next.longitude, next.opening_hours,
        next.contact_phone, next.contact_email, next.quote_url, next.demo_url, next.store_url, next.business_mode, now(), brand.id);
    return res.json({ item: getBrandOwner(db, db.prepare('SELECT * FROM brands WHERE id = ?').get(brand.id)) });
  });

  router.post('/me/brands/:id/publish', auth.requireVerified, (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    if (brand.status === 'removed' || brand.moderation_locked) throw new ApiError(409, 'CONFLICT', 'This brand can only be restored by a moderator.');
    requireBrandReady(db, req.user.id, brand, config);
    db.prepare("UPDATE brands SET status = 'published', updated_at = ? WHERE id = ?").run(now(), brand.id);
    return res.json({ item: getBrandOwner(db, db.prepare('SELECT * FROM brands WHERE id = ?').get(brand.id)) });
  });

  const changeBrandLifecycle = (action) => (req, res) => {
    const brand = ensureOwnerBrand(db, req.user.id, req.params.id);
    if (brand.status === 'removed' || brand.moderation_locked) throw new ApiError(409, 'CONFLICT', 'This brand can only be restored by a moderator.');
    if (action === 'pause' && brand.status !== 'published') throw new ApiError(409, 'CONFLICT', 'Only a published brand can be paused.');
    const status = action === 'pause' ? 'paused' : 'archived';
    db.prepare('UPDATE brands SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), brand.id);
    return res.json({ item: getBrandOwner(db, db.prepare('SELECT * FROM brands WHERE id = ?').get(brand.id)) });
  };
  router.post('/me/brands/:id/pause', auth.requireAuth, changeBrandLifecycle('pause'));
  router.post('/me/brands/:id/archive', auth.requireAuth, changeBrandLifecycle('archive'));

  return router;
}
