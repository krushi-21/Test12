import { ApiError, validationFields } from './errors.js';

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(422, 'VALIDATION_ERROR', 'Check the highlighted fields.', validationFields(result.error));
  return result.data;
}

export function assertCategory(db, category, field = 'category') {
  if (category && !db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(category)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a category from the platform catalog.', { [field]: 'This category is not available.' });
  }
}

export function assetIdFromUrl(url, config, field = 'url') {
  try {
    const parsed = new URL(url, config.apiOrigin);
    const expectedOrigin = new URL(config.apiOrigin).origin;
    const match = parsed.pathname.match(/^\/api\/media\/([0-9a-f-]{36})$/i);
    if (parsed.origin !== expectedOrigin || !match || parsed.search || parsed.hash) throw new Error('not a backend media URL');
    return match[1];
  } catch {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a file uploaded through this service.', { [field]: 'Use the URL returned by POST /api/uploads.' });
  }
}

export function assertOwnedAsset(db, userId, url, purpose, config, field) {
  if (!url) return null;
  const id = assetIdFromUrl(url, config, field);
  const asset = db.prepare('SELECT id, purpose FROM media_assets WHERE id = ? AND owner_user_id = ?').get(id, userId);
  if (!asset || (purpose && asset.purpose !== purpose)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Choose an image uploaded for this purpose by your account.', { [field]: 'This image is unavailable or belongs to another upload purpose.' });
  }
  return asset.id;
}

export function requireBrandReady(db, userId, brand, config) {
  const fields = {};
  if (!brand.name?.trim()) fields.name = 'Brand name is required.';
  if (!brand.description?.trim()) fields.description = 'Short business description is required.';
  if (!brand.category) fields.category = 'Choose a category.';
  else if (!db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(brand.category)) fields.category = 'Choose an available category.';
  if (!brand.logo_url) fields.logoUrl = 'Upload a logo image.';
  if (!brand.website_url && !brand.instagram_url) fields.websiteUrl = 'Add an official website or Instagram link.';
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Complete the required business identity fields before publishing.', fields);
  assertOwnedAsset(db, userId, brand.logo_url, 'brand-logo', config, 'logoUrl');
  return brand;
}

export function requireLaunchReady(db, userId, launch, brand, config) {
  const fields = {};
  for (const key of ['title', 'launch_type', 'category', 'summary', 'story']) if (!launch[key]?.toString().trim()) fields[key === 'launch_type' ? 'launchType' : key] = 'This field is required to publish.';
  if (!brand || brand.owner_user_id !== userId || brand.status !== 'published') fields.brandId = 'Publish a complete brand profile before publishing a launch.';
  if (!launch.images || launch.images.length < 1 || launch.images.length > 5) fields.images = 'Add between one and five carousel images.';
  if (!launch.founderIds || launch.founderIds.length < 1) fields.founderIds = 'Select at least one associated founder.';
  if (launch.category && !db.prepare('SELECT 1 FROM categories WHERE id = ? AND active = 1').get(launch.category)) fields.category = 'Choose an available category.';
  const profile = db.prepare('SELECT id FROM founder_profiles WHERE user_id = ?').get(userId);
  if (!profile) fields.founderIds = 'Create a founder profile before publishing a launch.';
  else if (launch.founderIds && !launch.founderIds.includes(profile.id)) fields.founderIds = 'Include your managing founder profile.';
  if (Object.keys(fields).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Complete the required launch fields before publishing.', fields);
  for (const [index, image] of launch.images.entries()) assertOwnedAsset(db, userId, image.url, 'launch-carousel', config, `images.${index}.url`);
  const allowed = db.prepare(`SELECT id, public_profile FROM founder_profiles WHERE id IN (${launch.founderIds.map(() => '?').join(',')})`).all(...launch.founderIds);
  if (allowed.length !== launch.founderIds.length || allowed.some(item => !item.public_profile && item.id !== profile.id)) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Only your profile and public founder profiles can be attributed.', { founderIds: 'Remove unavailable founder profiles.' });
  }
  return profile;
}

export function ensureOwnerBrand(db, userId, id) {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND owner_user_id = ?').get(id, userId);
  if (!brand) throw new ApiError(404, 'NOT_FOUND', 'Brand not found.');
  return brand;
}

export function ensureOwnerLaunch(db, userId, id) {
  const launch = db.prepare('SELECT * FROM launches WHERE id = ? AND owner_user_id = ?').get(id, userId);
  if (!launch) throw new ApiError(404, 'NOT_FOUND', 'Launch not found.');
  return launch;
}
