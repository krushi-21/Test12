import { notFound } from './errors.js';

const defined = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null));
function parseStringArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch { return []; }
}

export function getFounderPrivate(db, profile) {
  if (!profile) return null;
  const publicBrandIds = db.prepare('SELECT brand_id FROM founder_public_brands WHERE founder_profile_id = ? ORDER BY position').all(profile.id).map(row => row.brand_id);
  const financial = defined({
    revenueRange: profile.revenue_range, revenuePeriod: profile.revenue_period, revenuePublic: Boolean(profile.revenue_public),
    fundingRaisedRange: profile.funding_raised_range, fundingDate: profile.funding_date, fundingType: profile.funding_type, fundingPublic: Boolean(profile.funding_public),
    openToFunding: profile.open_to_funding == null ? undefined : Boolean(profile.open_to_funding), openToFundingPublic: Boolean(profile.open_to_funding_public)
  });
  return { id: profile.id, slug: profile.slug, displayName: profile.display_name, avatarUrl: profile.avatar_url ?? undefined,
    bio: profile.bio ?? undefined, city: profile.city ?? undefined, state: profile.state ?? undefined, role: profile.role ?? undefined,
    pronouns: profile.pronouns ?? undefined, interests: parseStringArray(profile.interests_json),
    instagramUrl: profile.instagram_url ?? undefined, publicProfile: Boolean(profile.public_profile), publicBrandIds,
    financial, updatedAt: profile.updated_at };
}

export function publicFounder(db, profile) {
  if (!profile || !profile.public_profile || profile.moderation_status !== 'active') throw notFound('This founder profile is unavailable.');
  const brands = db.prepare(`SELECT b.* FROM founder_public_brands fpb JOIN brands b ON b.id = fpb.brand_id
    WHERE fpb.founder_profile_id = ? AND b.status = 'published' ORDER BY fpb.position, b.name`).all(profile.id).map(publicBrandFields);
  const financial = {};
  let hasFinancial = false;
  if (profile.revenue_public && profile.revenue_range) {
    financial.revenue = { range: profile.revenue_range, period: profile.revenue_period ?? undefined, label: 'Self-reported, unverified', disclosedAt: profile.financial_disclosed_at ?? profile.updated_at };
    hasFinancial = true;
  }
  if (profile.funding_public && profile.funding_raised_range) {
    financial.fundingRaised = { range: profile.funding_raised_range, date: profile.funding_date ?? undefined, type: profile.funding_type ?? undefined, label: 'Self-reported, unverified', disclosedAt: profile.financial_disclosed_at ?? profile.updated_at };
    hasFinancial = true;
  }
  if (profile.open_to_funding_public && profile.open_to_funding != null) {
    financial.openToFunding = { value: Boolean(profile.open_to_funding), label: 'Self-reported, unverified', disclosedAt: profile.financial_disclosed_at ?? profile.updated_at };
    hasFinancial = true;
  }
  return defined({ id: profile.id, slug: profile.slug, displayName: profile.display_name, avatarUrl: profile.avatar_url,
    bio: profile.bio, city: profile.city, state: profile.state, role: profile.role, pronouns: profile.pronouns,
    interests: parseStringArray(profile.interests_json), instagramUrl: profile.instagram_url,
    brands, financial: hasFinancial ? financial : undefined });
}

function publicBrandFields(row) {
  return defined({ id: row.id, slug: row.slug, name: row.name, logoUrl: row.logo_url, coverImageUrl: row.cover_image_url,
    galleryImageUrls: parseStringArray(row.gallery_image_urls), description: row.description,
    category: row.category, tagline: row.tagline, city: row.city, state: row.state, area: row.area, address: row.address,
    latitude: row.latitude, longitude: row.longitude, openingHours: parseOpeningHours(row.opening_hours), businessMode: row.business_mode,
    contactPhone: row.contact_phone, contactEmail: row.contact_email, foundedYear: row.founded_year,
    links: defined({ website: row.website_url, instagram: row.instagram_url, whatsapp: row.whatsapp_url, phone: row.contact_phone,
      email: row.contact_email, quote: row.quote_url, demo: row.demo_url, store: row.store_url }) });
}

function parseOpeningHours(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

export function getBrandOwner(db, brand) {
  if (!brand) return null;
  const launchCount = db.prepare('SELECT COUNT(*) AS n FROM launches WHERE brand_id = ?').get(brand.id).n;
  return { ...publicBrandFields(brand), websiteUrl: brand.website_url ?? undefined, instagramUrl: brand.instagram_url ?? undefined,
    whatsappUrl: brand.whatsapp_url ?? undefined, quoteUrl: brand.quote_url ?? undefined, demoUrl: brand.demo_url ?? undefined, storeUrl: brand.store_url ?? undefined,
    area: brand.area ?? undefined, address: brand.address ?? undefined, latitude: brand.latitude ?? undefined, longitude: brand.longitude ?? undefined,
    contactPhone: brand.contact_phone ?? undefined, contactEmail: brand.contact_email ?? undefined,
    openingHours: parseOpeningHours(brand.opening_hours), businessMode: brand.business_mode, status: brand.status, moderationLocked: Boolean(brand.moderation_locked), launchCount, ownerUserId: brand.owner_user_id,
    createdAt: brand.created_at, updatedAt: brand.updated_at };
}

export function getLaunchOwner(db, launch) {
  if (!launch) return null;
  const images = db.prepare('SELECT url, alt_text AS altText, position FROM launch_images WHERE launch_id = ? ORDER BY position').all(launch.id);
  const founderIds = db.prepare('SELECT founder_profile_id FROM launch_founders WHERE launch_id = ? ORDER BY position').all(launch.id).map(x => x.founder_profile_id);
  return defined({ id: launch.id, slug: launch.slug, title: launch.title, launchType: launch.launch_type, category: launch.category,
    summary: launch.summary, story: launch.story, images, brandId: launch.brand_id, founderIds, launchDate: launch.launch_date,
    launchAt: launch.launch_at, endsAt: launch.ends_at,
    availabilityNote: launch.availability_note, priceInrPaise: launch.price_inr_paise, websiteUrl: launch.website_url,
    instagramUrl: launch.instagram_url, whatsappUrl: launch.whatsapp_url, leaderboardOptOut: Boolean(launch.leaderboard_opt_out),
    status: launch.status, moderationLocked: Boolean(launch.moderation_locked), publishedAt: launch.published_at, createdAt: launch.created_at, updatedAt: launch.updated_at });
}

export function loadPublicLaunch(db, idOrSlug, viewer) {
  const launch = db.prepare(`SELECT l.*, b.slug AS brand_slug, b.name AS brand_name, b.logo_url AS brand_logo_url,
    b.category AS brand_category, b.website_url AS brand_website_url, b.instagram_url AS brand_instagram_url,
    b.whatsapp_url AS brand_whatsapp_url, b.city AS brand_city, b.state AS brand_state, b.area AS brand_area, b.address AS brand_address,
    b.latitude AS brand_latitude, b.longitude AS brand_longitude, b.opening_hours AS brand_opening_hours,
    b.contact_phone AS brand_contact_phone, b.contact_email AS brand_contact_email, b.quote_url AS brand_quote_url,
    b.demo_url AS brand_demo_url, b.store_url AS brand_store_url, b.status AS brand_status
    FROM launches l JOIN brands b ON b.id = l.brand_id
    WHERE (l.id = ? OR l.slug = ?) AND l.status = 'published' AND b.status = 'published'`).get(idOrSlug, idOrSlug);
  if (!launch) throw notFound('This launch is unavailable.');
  const images = db.prepare('SELECT url, alt_text AS altText FROM launch_images WHERE launch_id = ? ORDER BY position').all(launch.id);
  const founders = db.prepare(`SELECT fp.id, fp.slug, fp.display_name AS displayName, fp.avatar_url AS avatarUrl
    FROM launch_founders lf JOIN founder_profiles fp ON fp.id = lf.founder_profile_id
    WHERE lf.launch_id = ? AND fp.public_profile = 1 AND fp.moderation_status = 'active' ORDER BY lf.position`).all(launch.id).map(x => defined(x));
  const likeCount = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE launch_id = ?').get(launch.id).n;
  const item = {
    id: launch.id, slug: launch.slug, title: launch.title, launchType: launch.launch_type, category: launch.category,
    summary: launch.summary, images,
    brand: { id: launch.brand_id, slug: launch.brand_slug, name: launch.brand_name, logoUrl: launch.brand_logo_url },
    founders,
    publishedAt: launch.published_at, launchDate: launch.launch_date ?? undefined, launchAt: launch.launch_at ?? undefined,
    endsAt: launch.ends_at ?? undefined, priceInrPaise: launch.price_inr_paise ?? undefined,
    availabilityNote: launch.availability_note ?? undefined,
    location: defined({ city: launch.brand_city, state: launch.brand_state, area: launch.brand_area, address: launch.brand_address,
      latitude: launch.brand_latitude, longitude: launch.brand_longitude, openingHours: parseOpeningHours(launch.brand_opening_hours) }),
    links: defined({
      website: launch.website_url ?? launch.brand_website_url,
      instagram: launch.instagram_url ?? launch.brand_instagram_url,
      whatsapp: launch.whatsapp_url ?? launch.brand_whatsapp_url, phone: launch.brand_contact_phone, email: launch.brand_contact_email,
      quote: launch.brand_quote_url, demo: launch.brand_demo_url, store: launch.brand_store_url
    }),
    engagement: { likes: likeCount }
  };
  if (viewer?.emailVerified) {
    item.viewerState = {
      liked: Boolean(db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND launch_id = ?').get(viewer.id, launch.id)),
      saved: Boolean(db.prepare('SELECT 1 FROM saves WHERE user_id = ? AND launch_id = ?').get(viewer.id, launch.id))
    };
  }
  return { ...item, story: launch.story };
}

export function loadPublicBrand(db, slug, viewerId) {
  const brand = db.prepare("SELECT * FROM brands WHERE slug = ? AND status = 'published'").get(slug);
  if (!brand) throw notFound('This brand page is unavailable.');
  const founder = db.prepare(`SELECT fp.id, fp.slug, fp.display_name AS displayName, fp.avatar_url AS avatarUrl
    FROM founder_profiles fp JOIN founder_public_brands fpb ON fpb.founder_profile_id = fp.id
    WHERE fpb.brand_id = ? AND fp.user_id = ? AND fp.public_profile = 1 AND fp.moderation_status = 'active'`).get(brand.id, brand.owner_user_id);
  const launches = db.prepare("SELECT id, slug FROM launches WHERE brand_id = ? AND status = 'published' ORDER BY published_at DESC LIMIT 50").all(brand.id)
    .map(row => loadPublicLaunch(db, row.id));
  const products = db.prepare('SELECT id, brand_id, name, description, price_inr_paise, image_url, buy_url, created_at, updated_at FROM products WHERE brand_id = ? ORDER BY position, created_at DESC').all(brand.id).map(row => ({
    id: row.id, brandId: row.brand_id, name: row.name, description: row.description,
    ...(row.price_inr_paise == null ? {} : { priceInrPaise: row.price_inr_paise }),
    ...(row.image_url ? { imageUrl: row.image_url } : {}), buyUrl: row.buy_url, createdAt: row.created_at, updatedAt: row.updated_at
  }));
  const founderEmailVerified = Boolean(db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(brand.owner_user_id)?.email_verified_at);
  const saveCount = db.prepare('SELECT COUNT(*) AS n FROM business_saves WHERE brand_id = ?').get(brand.id).n;
  const isSaved = viewerId ? Boolean(db.prepare('SELECT 1 FROM business_saves WHERE user_id = ? AND brand_id = ?').get(viewerId, brand.id)) : false;
  return { ...publicBrandFields(brand), isSaved, saveCount, founderEmailVerified, ...(founder ? { founders: [defined(founder)] } : { founders: [] }), launches, products };
}

export function loadPublicFounder(db, idOrSlug) {
  const profile = db.prepare("SELECT * FROM founder_profiles WHERE (id = ? OR slug = ?) AND public_profile = 1 AND moderation_status = 'active'").get(idOrSlug, idOrSlug);
  return publicFounder(db, profile);
}
