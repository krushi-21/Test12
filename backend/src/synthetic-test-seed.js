import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { hashPassword } from './auth.js';
import { localDay } from './lib/time.js';

export const SYNTHETIC_TEST_ACCOUNTS = Object.freeze({
  founder: { displayName: 'Rhea Sample', email: 'founder@synthetic.example.invalid', password: 'TestFounder_2026!' },
  member: { displayName: 'Milan Sample', email: 'member@synthetic.example.invalid', password: 'TestMember_2026!' }
});

const now = () => new Date().toISOString();
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureDirectory = path.join(workspaceRoot, 'frontend', 'public', 'images');

export async function seedSyntheticTestDatabase(db, { uploadDir, webOrigin }) {
  await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
  await fs.chmod(uploadDir, 0o700);

  const founderId = randomUUID();
  const memberId = randomUUID();
  const profileId = randomUUID();
  const miraUserId = randomUUID();
  const miraProfileId = randomUUID();
  const brandId = randomUUID();
  const logoAssetId = randomUUID();
  const launchAssetId = randomUUID();
  const timestamp = now();
  const profileSlug = 'rhea-sample-test-founder';

  const users = [
    { id: founderId, ...SYNTHETIC_TEST_ACCOUNTS.founder },
    { id: memberId, ...SYNTHETIC_TEST_ACCOUNTS.member }
  ];
  for (const user of users) {
    const passwordHash = await hashPassword(user.password);
    db.prepare(`INSERT INTO users(id, display_name, email, password_hash, email_verified_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(user.id, user.displayName, user.email, passwordHash, timestamp, timestamp, timestamp);
  }

  db.prepare(`INSERT INTO founder_profiles(id, user_id, slug, display_name, bio, city, state, role,
    public_profile, moderation_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)`)
    .run(profileId, founderId, profileSlug, 'Rhea Sample',
      'A fictional founder profile seeded only for isolated local testing.', 'Jaipur', 'Rajasthan',
      'Synthetic founder account', timestamp, timestamp);

  const miraPasswordHash = await hashPassword(randomUUID());
  db.prepare(`INSERT INTO users(id, display_name, email, password_hash, email_verified_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(miraUserId, 'Mira Shah', 'mira.shah@synthetic.example.invalid', miraPasswordHash, timestamp, timestamp, timestamp);
  db.prepare(`INSERT INTO founder_profiles(id, user_id, slug, display_name, bio, city, state, role,
    public_profile, moderation_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)`)
    .run(miraProfileId, miraUserId, 'mira-shah-synthetic-founder', 'Mira Shah',
      'Mira designs with local artisans to create contemporary home pieces rooted in craft, function and story.',
      'Ahmedabad', 'Gujarat', 'Founder', timestamp, timestamp);

  const assets = [
    { id: logoAssetId, purpose: 'brand-logo', source: 'launch-craft.webp', filename: 'synthetic-brand-logo.webp' },
    { id: launchAssetId, purpose: 'launch-carousel', source: 'launch-home.jpg', filename: 'synthetic-launch-image.jpg' }
  ];
  for (const asset of assets) {
    const storagePath = path.join(uploadDir, asset.filename);
    await fs.copyFile(path.join(fixtureDirectory, asset.source), storagePath);
    await fs.chmod(storagePath, 0o600);
    const metadata = await sharp(storagePath).metadata();
    const stats = await fs.stat(storagePath);
    db.prepare(`INSERT INTO media_assets(id, owner_user_id, purpose, file_name, storage_path, mime_type,
      size_bytes, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(asset.id, founderId, asset.purpose, asset.filename, storagePath,
        asset.source.endsWith('.webp') ? 'image/webp' : 'image/jpeg', stats.size,
        metadata.width, metadata.height, timestamp);
    asset.url = `${webOrigin}/api/media/${asset.id}`;
  }
  const logo = assets[0];
  const launchImage = assets[1];

  db.prepare(`INSERT INTO brands(id, owner_user_id, slug, name, logo_url, description, category, website_url,
    tagline, city, state, founded_year, area, address, latitude, longitude, opening_hours, contact_phone, contact_email,
    quote_url, demo_url, store_url, business_mode, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?) `)
    .run(brandId, founderId, 'sample-orbit-labs', 'Sample Orbit Labs', logo.url,
      'A fictional sample brand for exercising browse and founder-workspace flows.', 'technology-software',
      'https://sample-orbit.invalid', 'Synthetic ideas, safely tested.', 'Jaipur', 'Rajasthan', 2024, 'C-Scheme', 'Sample Market, C-Scheme, Jaipur', 26.9124, 75.7873,
      JSON.stringify({ mon: { open: '00:00', close: '23:59' }, tue: { open: '00:00', close: '23:59' }, wed: { open: '00:00', close: '23:59' }, thu: { open: '00:00', close: '23:59' }, fri: { open: '00:00', close: '23:59' }, sat: { open: '00:00', close: '23:59' }, sun: { open: '00:00', close: '23:59' } }),
      '+910000000000', 'hello@sample-orbit.synthetic.example.invalid', 'https://sample-orbit.invalid/quote', 'https://sample-orbit.invalid/demo', 'https://sample-orbit.invalid/store', 'hybrid', timestamp, timestamp);
  db.prepare('INSERT INTO founder_public_brands(founder_profile_id, brand_id, position) VALUES (?, ?, 0)')
    .run(profileId, brandId);
  db.prepare(`INSERT INTO products(id, brand_id, name, description, price_inr_paise, image_url, buy_url, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, 0, ?, ?)`)
    .run(randomUUID(), brandId, 'Sample Orbit Starter Kit', 'A fictional catalog item for testing direct-to-business links.', 129900,
      'https://sample-orbit.invalid/products/starter-kit', timestamp, timestamp);

  const allDayHours = JSON.stringify({ mon: { open: '00:00', close: '23:59' }, tue: { open: '00:00', close: '23:59' }, wed: { open: '00:00', close: '23:59' }, thu: { open: '00:00', close: '23:59' }, fri: { open: '00:00', close: '23:59' }, sat: { open: '00:00', close: '23:59' }, sun: { open: '00:00', close: '23:59' } });
  const sampleBusinesses = [
    { slug: 'sample-riverstone-cafe', name: 'Sample Riverstone Cafe', category: 'food-beverage', city: 'Ahmedabad', state: 'Gujarat', area: 'Navrangpura', address: 'Sample House, Navrangpura, Ahmedabad', latitude: 23.0225, longitude: 72.5714, businessMode: 'physical' },
    { slug: 'sample-loomworks-studio', name: 'Sample Loomworks Studio', category: 'arts-crafts', city: 'Ahmedabad', state: 'Gujarat', area: 'Law Garden', address: 'Sample Arcade, Law Garden, Ahmedabad', latitude: 23.0302, longitude: 72.5706, businessMode: 'hybrid' },
    { slug: 'sample-byte-tools', name: 'Sample Byte Tools', category: 'technology-software', city: 'Bengaluru', state: 'Karnataka', area: 'Indiranagar', address: 'Sample Block, Indiranagar, Bengaluru', latitude: 12.9716, longitude: 77.5946, businessMode: 'online' },
    { slug: 'sample-balcony-garden', name: 'Sample Balcony Garden', category: 'home-living', city: 'Jaipur', state: 'Rajasthan', area: 'Malviya Nagar', address: 'Sample Lane, Malviya Nagar, Jaipur', latitude: 26.8547, longitude: 75.8243, businessMode: 'hybrid' },
    { slug: 'sample-neighbourhood-lab', name: 'Sample Neighbourhood Lab', category: 'community-social', city: 'Mumbai', state: 'Maharashtra', area: 'Bandra West', address: 'Sample Corner, Bandra West, Mumbai', latitude: 19.0596, longitude: 72.8295, businessMode: 'physical' },
    { slug: 'sample-threadline-fashion', name: 'Sample Threadline Fashion', category: 'fashion-accessories', city: 'Delhi', state: 'Delhi', area: 'Hauz Khas', address: 'Sample Studio, Hauz Khas, Delhi', latitude: 28.5494, longitude: 77.2001, businessMode: 'hybrid' },
    { slug: 'sample-home-bakery', name: 'Sample Home Bakery', category: 'food-beverage', city: 'Pune', state: 'Maharashtra', area: 'Kothrud', address: 'Sample Kitchen, Kothrud, Pune', latitude: 18.5074, longitude: 73.8077, businessMode: 'physical' },
    { slug: 'sample-fitness-studio', name: 'Sample Fitness Studio', category: 'health-wellness', city: 'Hyderabad', state: 'Telangana', area: 'Jubilee Hills', address: 'Sample Hall, Jubilee Hills, Hyderabad', latitude: 17.4319, longitude: 78.4074, businessMode: 'physical' }
  ].map(item => ({ ...item, id: randomUUID() }));
  const insertBusiness = db.prepare(`INSERT INTO brands(id, owner_user_id, slug, name, logo_url, description, category, website_url,
    tagline, city, state, area, address, latitude, longitude, opening_hours, contact_phone, contact_email, quote_url, demo_url,
    store_url, business_mode, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`);
  sampleBusinesses.forEach((business, index) => {
    insertBusiness.run(business.id, founderId, business.slug, business.name, logo.url,
      `A fictional ${business.name.toLowerCase()} listing for testing India-wide discovery.`, business.category,
      `https://${business.slug}.invalid`, 'Synthetic sample listing only.', business.city, business.state, business.area, business.address,
      business.latitude, business.longitude, allDayHours, '+910000000000', `hello@${business.slug}.synthetic.example.invalid`,
      `https://${business.slug}.invalid/quote`, `https://${business.slug}.invalid/demo`, `https://${business.slug}.invalid/store`, business.businessMode, timestamp, timestamp);
    db.prepare('INSERT INTO founder_public_brands(founder_profile_id, brand_id, position) VALUES (?, ?, ?)').run(profileId, business.id, index + 1);
  });
  const miraBusiness = {
    id: randomUUID(), slug: 'miti-studio', name: 'Miti Studio', category: 'arts-crafts',
    city: 'Ahmedabad', state: 'Gujarat', area: 'Navrangpura', address: 'Synthetic Studio Lane, Navrangpura, Ahmedabad',
    latitude: 23.0225, longitude: 72.5714, businessMode: 'hybrid'
  };
  insertBusiness.run(miraBusiness.id, miraUserId, miraBusiness.slug, miraBusiness.name, logo.url,
    'A fictional Ahmedabad home studio collaborating with local artisans. This business is synthetic.', miraBusiness.category,
    'https://miti-studio.synthetic.invalid', 'Contemporary home pieces rooted in craft, function and story.',
    miraBusiness.city, miraBusiness.state, miraBusiness.area, miraBusiness.address, miraBusiness.latitude, miraBusiness.longitude,
    allDayHours, '+910000000000', 'hello@miti-studio.synthetic.example.invalid',
    'https://miti-studio.synthetic.invalid/quote', 'https://miti-studio.synthetic.invalid/demo',
    'https://miti-studio.synthetic.invalid/store', miraBusiness.businessMode, timestamp, timestamp);
  db.prepare('INSERT INTO founder_public_brands(founder_profile_id, brand_id, position) VALUES (?, ?, 0)')
    .run(miraProfileId, miraBusiness.id);

  const launchRows = [
    ['sample-release-notes', 'A calmer way to share release notes', 'product', 'technology-software', 'A fictional product launch for safe interface testing.'],
    ['sample-neighborhood-map', 'A map made for neighborhood makers', 'service', 'community-social', 'Imaginary local discovery tools from synthetic sample records.'],
    ['sample-studio-toolkit', 'A small studio launch toolkit', 'product', 'arts-crafts', 'A fictional toolkit launch written only for this test preview.'],
    ['sample-garden-kit', 'A garden kit for tiny balconies', 'product', 'home-living', 'Synthetic launch copy; no real product or seller is represented.'],
    ['sample-pantry-club', 'The imaginary pantry club', 'business', 'food-beverage', 'An entirely fictional sample launch used for API browse testing.'],
    ['sample-cafe-opening', 'Sample Riverstone Cafe opening', 'business', 'food-beverage', 'A fictional neighborhood cafe launch in Ahmedabad.'],
    ['sample-loomworks-drop', 'Sample Loomworks collection', 'product', 'arts-crafts', 'A fictional maker collection launch in Ahmedabad.'],
    ['sample-byte-preview', 'Sample Byte Tools preview', 'service', 'technology-software', 'A fictional software service preview in Bengaluru.'],
    ['sample-balcony-kit', 'Sample Balcony Garden kit', 'product', 'home-living', 'A fictional balcony gardening kit in Jaipur.'],
    ['sample-neighbourhood-session', 'Sample Neighbourhood Lab session', 'service', 'community-social', 'A fictional local community session in Mumbai.'],
    ['sample-threadline-drop', 'Sample Threadline capsule collection', 'product', 'fashion-accessories', 'A fictional local fashion brand and capsule collection in Delhi.'],
    ['sample-home-bakery-menu', 'Sample Home Bakery weekly menu', 'business', 'food-beverage', 'A fictional home bakery launch in Pune.'],
    ['sample-fitness-opening', 'Sample Fitness Studio opening', 'business', 'health-wellness', 'A fictional fitness studio launch in Hyderabad.'],
    ['sample-coming-soon', 'Sample upcoming launch', 'product', 'arts-crafts', 'A fictional scheduled launch for exercising reminders and countdowns.']
  ];
  const insertLaunch = db.prepare(`INSERT INTO launches(id, brand_id, owner_user_id, slug, title, launch_type, category,
    summary, story, price_inr_paise, launch_date, launch_at, ends_at, status, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`);
  const insertImage = db.prepare(`INSERT INTO launch_images(id, launch_id, asset_id, url, alt_text, position)
    VALUES (?, ?, ?, ?, ?, 0)`);
  const insertFounder = db.prepare('INSERT INTO launch_founders(launch_id, founder_profile_id, position) VALUES (?, ?, 0)');
  const seededLaunches = [];
  for (const [index, [slug, title, type, category, summary]] of launchRows.entries()) {
    const launchId = randomUUID();
    const publishedAt = new Date(Date.now() - index * 60_000).toISOString();
    const business = index < 5 ? { id: brandId } : sampleBusinesses[index - 5] || sampleBusinesses.at(-1);
    const scheduled = slug === 'sample-coming-soon' ? new Date(Date.now() + 2 * 86_400_000).toISOString() : publishedAt;
    const localLaunchDate = localDay(new Date(scheduled));
    const endsAt = slug === 'sample-coming-soon' ? new Date(Date.now() + 3 * 86_400_000).toISOString() : new Date(Date.now() + 36 * 60 * 60_000).toISOString();
    insertLaunch.run(launchId, business.id, founderId, slug, title, type, category, summary,
      `${summary} This record, its people, and its business are synthetic.`, 9900 + index * 500,
      localLaunchDate, scheduled, endsAt, publishedAt, publishedAt, publishedAt);
    insertImage.run(randomUUID(), launchId, launchAssetId, launchImage.url,
      `Synthetic sample image for ${title}`);
    insertFounder.run(launchId, profileId);
    seededLaunches.push({ id: launchId, brandId: business.id, slug });
  }
  const miraLaunchRows = [
    ['miti-handwoven-home-textiles', 'Miti Studio Handwoven Home Textiles', 'product', 'home-living', 'A fictional collection of handwoven home textiles from Miti Studio.'],
    ['miti-woven-lighting', 'Miti Studio Woven Light Collection', 'product', 'arts-crafts', 'A synthetic launch of artisan-woven lighting made for contemporary homes.'],
    ['miti-artisan-tableware', 'Miti Studio Artisan Tableware', 'product', 'home-living', 'A fictional artisan tableware collection from Miti Studio.']
  ];
  const miraLaunchIds = [];
  for (const [index, [slug, title, type, category, summary]] of miraLaunchRows.entries()) {
    const launchId = randomUUID();
    const publishedAt = new Date(Date.now() - (launchRows.length + index) * 60_000).toISOString();
    const localLaunchDate = localDay(new Date(publishedAt));
    const endsAt = new Date(Date.now() + 36 * 60 * 60_000).toISOString();
    insertLaunch.run(launchId, miraBusiness.id, miraUserId, slug, title, type, category, summary,
      `${summary} This record, its people, and its business are synthetic.`, 14900 + index * 2500,
      localLaunchDate, publishedAt, endsAt, publishedAt, publishedAt, publishedAt);
    insertImage.run(randomUUID(), launchId, launchAssetId, launchImage.url, `Synthetic sample image for ${title}`);
    insertFounder.run(launchId, miraProfileId);
    miraLaunchIds.push(launchId);
    seededLaunches.push({ id: launchId, brandId: miraBusiness.id, slug });
  }

  const publicGuideLaunches = seededLaunches.filter(launch => [
    'sample-cafe-opening', 'sample-loomworks-drop', 'sample-neighbourhood-session', 'sample-threadline-drop'
  ].includes(launch.slug));
  const collectionId = randomUUID();
  db.prepare(`INSERT INTO collections(id, owner_user_id, name, description, is_public, share_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
    .run(collectionId, founderId, 'Sample Local Launch Guide',
      'A fictional guide to neighborhood launches in Ahmedabad, Mumbai, and Delhi. Every record is synthetic.',
      randomUUID(), timestamp, timestamp);
  const insertCollectionItem = db.prepare(`INSERT INTO collection_items(collection_id, launch_id, position, added_at)
    VALUES (?, ?, ?, ?)`);
  publicGuideLaunches.forEach((launch, position) => insertCollectionItem.run(collectionId, launch.id, position, timestamp));

  const makersGuideId = randomUUID();
  db.prepare(`INSERT INTO collections(id, owner_user_id, name, description, is_public, share_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
    .run(makersGuideId, founderId, 'Sample Makers & Ideas Guide',
      'A fictional guide to ideas for makers, neighbors, and small spaces. Every record is synthetic.',
      randomUUID(), timestamp, timestamp);
  const makersGuideLaunches = seededLaunches.filter(launch => [
    'sample-release-notes', 'sample-neighborhood-map', 'sample-studio-toolkit', 'sample-garden-kit'
  ].includes(launch.slug));
  makersGuideLaunches.forEach((launch, position) => insertCollectionItem.run(makersGuideId, launch.id, position, timestamp));

  const miraCollectionId = randomUUID();
  db.prepare(`INSERT INTO collections(id, owner_user_id, name, description, is_public, share_token, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
    .run(miraCollectionId, miraUserId, 'Miti Studio Community Picks',
      'A fictional public collection of three Miti Studio launches. All people, businesses, and products are synthetic.',
      randomUUID(), timestamp, timestamp);
  const miraLaunches = seededLaunches.filter(launch => launch.brandId === miraBusiness.id);
  miraLaunches.forEach((launch, position) => insertCollectionItem.run(miraCollectionId, launch.id, position, timestamp));

  const insertBusinessEvent = db.prepare(`INSERT INTO business_events(id, event_type, brand_id, actor_key, source, local_day, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const [index, business] of [{ id: brandId }, ...sampleBusinesses, miraBusiness].entries()) {
    for (let visit = 0; visit < 2; visit++) insertBusinessEvent.run(randomUUID(), 'profile_view', business.id,
      `synthetic-seed:${business.id}:profile:${visit}`, visit ? 'nearby' : 'search', localDay(), timestamp);
    if (index % 3 === 0) insertBusinessEvent.run(randomUUID(), 'website_click', business.id,
      `synthetic-seed:${business.id}:website`, 'search', localDay(), timestamp);
  }

  const insertEngagement = db.prepare(`INSERT INTO engagement_events(id, event_type, launch_id, brand_id, actor_user_id, actor_key,
    destination, source, local_day, qualified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [index, launch] of seededLaunches.slice(0, 9).entries()) {
    if (index % 2 === 0) {
      const createdAt = now();
      db.prepare('INSERT INTO likes(user_id, launch_id, created_at) VALUES (?, ?, ?)').run(memberId, launch.id, createdAt);
      insertEngagement.run(randomUUID(), 'like', launch.id, launch.brandId, memberId, `synthetic-seed:${memberId}:like:${launch.id}`, null, 'search', localDay(), 1, createdAt);
    }
    if (index % 3 === 0) {
      const createdAt = now();
      db.prepare('INSERT INTO saves(user_id, launch_id, created_at) VALUES (?, ?, ?)').run(memberId, launch.id, createdAt);
      insertEngagement.run(randomUUID(), 'save', launch.id, launch.brandId, memberId, `synthetic-seed:${memberId}:save:${launch.id}`, null, 'search', localDay(), 1, createdAt);
    }
    if (index === 0) insertEngagement.run(randomUUID(), 'click_out', launch.id, launch.brandId, memberId,
      `synthetic-seed:${memberId}:click_out:${launch.id}`, 'website', 'search', localDay(), 1, now());
  }

  return { founderId, memberId, profileId, brandId, businessIds: sampleBusinesses.map(item => item.id),
    miraFounderProfileId: miraProfileId, miraBusinessId: miraBusiness.id, miraLaunchIds, miraCollectionId,
    launchImageUrl: launchImage.url, seededLaunchCount: seededLaunches.length, seededBusinessCount: sampleBusinesses.length + 2 };
}
