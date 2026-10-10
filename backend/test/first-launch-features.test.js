import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { openDatabase } from '../db/index.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

async function context(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aarambh-first-launch-'));
  const db = openDatabase(':memory:', { migrate: true });
  const messages = [];
  const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', uploadDir: path.join(root, 'uploads'), mailDir: path.join(root, 'mail'),
    apiOrigin: 'http://localhost:4000', webOrigin: 'http://localhost:5173', cookieSecure: false, previewReadOnly: false,
    sessionSecret: 'first-launch-isolated-test-session-secret', analyticsSalt: 'first-launch-isolated-test-analytics-salt' });
  const app = createApp({ db, config, sendEmail: async message => { messages.push(message); } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { app, db, config, messages };
}
function oneTimeToken(message) {
  const link = message.text.match(/https?:\/\/[^\s]+/u)?.[0];
  assert.ok(link, 'verification message has a local one-time URL');
  return new URL(link).searchParams.get('token');
}
async function verified(ctx, displayName, email) {
  const client = request.agent(ctx.app);
  assert.equal((await client.post('/api/auth/register').send({ displayName, email, password: 'FirstLaunch_Test_Pass_2026!' })).status, 202);
  const row = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const response = await client.post('/api/auth/verify-email').send({ token: oneTimeToken(ctx.messages.at(-1)) });
  assert.equal(response.status, 200);
  return { client, id: row.id };
}
async function upload(client, purpose) {
  const image = await sharp({ create: { width: 24, height: 20, channels: 3, background: { r: 80, g: 130, b: 95 } } }).png().toBuffer();
  const response = await client.post('/api/uploads').field('purpose', purpose).attach('file', image, { filename: 'synthetic.png', contentType: 'image/png' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.asset;
}
async function ownerBusiness(ctx, owner, name = 'Sample Ahmedabad Studio') {
  const profile = await owner.client.post('/api/me/founder-profile').send({ profile: { displayName: name, bio: 'A fictional test founder.', city: 'Ahmedabad', state: 'Gujarat', publicProfile: true } });
  assert.equal(profile.status, 201, JSON.stringify(profile.body));
  const logo = await upload(owner.client, 'brand-logo');
  const brandResponse = await owner.client.post('/api/me/brands').send({ brand: {
    name, logoUrl: logo.url, description: 'A synthetic small business for an isolated API test.', category: 'food-beverage',
    websiteUrl: 'https://synthetic-business.invalid', city: 'Ahmedabad', state: 'Gujarat', area: 'Navrangpura',
    address: 'Synthetic Sample Street, Ahmedabad', latitude: 23.0225, longitude: 72.5714,
    contactPhone: '+910000000000', contactEmail: 'hello@synthetic.example.invalid', quoteUrl: 'https://synthetic-business.invalid/quote',
    businessMode: 'physical', openingHours: { mon: { open: '00:00', close: '23:59' }, tue: { open: '00:00', close: '23:59' },
      wed: { open: '00:00', close: '23:59' }, thu: { open: '00:00', close: '23:59' }, fri: { open: '00:00', close: '23:59' },
      sat: { open: '00:00', close: '23:59' }, sun: { open: '00:00', close: '23:59' } }
  } });
  assert.equal(brandResponse.status, 201, JSON.stringify(brandResponse.body));
  const brand = await owner.client.post(`/api/me/brands/${brandResponse.body.item.id}/publish`).send({});
  assert.equal(brand.status, 200, JSON.stringify(brand.body));
  return { profile: profile.body.item, brand: brand.body.item, image: await upload(owner.client, 'launch-carousel') };
}

 test('first-launch APIs enforce follows, scheduled lifecycle, private collections, structured reviews, discovery, analytics, and notices on an in-memory database', async t => {
  const ctx = await context(t);
  assert.equal(ctx.db.name, ':memory:');
  const owner = await verified(ctx, 'Synthetic Founder', 'founder@synthetic.example.invalid');
  const member = await verified(ctx, 'Synthetic Member', 'member@synthetic.example.invalid');
  const { profile, brand, image } = await ownerBusiness(ctx, owner);

  const followedBrand = await member.client.put(`/api/me/follows/brand/${brand.id}`).send({});
  assert.equal(followedBrand.status, 200);
  assert.equal((await member.client.put(`/api/me/follows/founder/${profile.id}`).send({})).status, 200);
  assert.equal((await member.client.put('/api/me/follows/category/food-beverage').send({})).status, 200);
  assert.equal((await owner.client.put(`/api/me/follows/brand/${brand.id}`).send({})).status, 403, 'owners cannot follow their own business');
  const followed = await member.client.get('/api/me/follows');
  assert.equal(followed.status, 200);
  assert.equal(followed.body.items.length, 3);
  const hoursUpdate = await owner.client.patch(`/api/me/brands/${brand.id}`).send({ brand: { openingHours: { mon: { open: '10:30', close: '18:00' }, sun: 'closed' } } });
  assert.equal(hoursUpdate.status, 200, JSON.stringify(hoursUpdate.body));
  assert.deepEqual(hoursUpdate.body.item.openingHours, { mon: { open: '10:30', close: '18:00' }, sun: 'closed' });

  const launchAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const endsAt = new Date(Date.now() + 36 * 60 * 60_000).toISOString();
  const createdLaunch = await owner.client.post(`/api/me/brands/${brand.id}/launches`).send({ status: 'draft', launch: {
    title: 'Synthetic scheduled launch', launchType: 'product', category: 'food-beverage',
    summary: 'A fictional upcoming launch.', story: 'This launch is synthetic and exists only in an in-memory test database.',
    images: [{ url: image.url, altText: 'Synthetic test launch image' }], brandId: brand.id, founderIds: [profile.id],
    launchDate: launchAt.slice(0, 10), launchAt, endsAt
  } });
  assert.equal(createdLaunch.status, 201, JSON.stringify(createdLaunch.body));
  const launch = await owner.client.post(`/api/me/launches/${createdLaunch.body.item.id}/publish`).send({});
  assert.equal(launch.status, 200, JSON.stringify(launch.body));
  assert.equal(launch.body.item.endsAt, endsAt);
  assert.equal((await member.client.put(`/api/launches/${launch.body.item.slug}/like`).send({})).status, 200);
  assert.equal((await member.client.put(`/api/launches/${launch.body.item.slug}/save`).send({})).status, 200);

  const lifecycle = await member.client.get(`/api/launches/${launch.body.item.slug}/lifecycle`);
  assert.equal(lifecycle.status, 200);
  assert.equal(lifecycle.body.lifecycleStage, 'coming_soon');
  assert.ok(lifecycle.body.countdownSeconds > 0);
  assert.equal((await member.client.put(`/api/launches/${launch.body.item.slug}/notify`).send({})).body.notified, true);
  assert.equal((await owner.client.put(`/api/launches/${launch.body.item.slug}/notify`).send({})).status, 403);
  assert.equal((await member.client.get('/api/launches/upcoming')).body.items.some(item => item.id === launch.body.item.id), true);
  const following = await member.client.get('/api/me/following');
  assert.equal(following.status, 200);
  assert.ok(following.body.items.some(item => item.id === launch.body.item.id));
  const followedNotifications = await member.client.get('/api/me/notifications');
  assert.ok(followedNotifications.body.items.some(item => item.kind === 'followed_launch'));

  const collection = await member.client.post('/api/me/collections').send({ collection: { name: 'Synthetic Neighborhood Picks', description: 'Temporary test list', isPublic: true } });
  assert.equal(collection.status, 201);
  const collectionId = collection.body.item.id;
  assert.equal((await member.client.post(`/api/me/collections/${collectionId}/items`).send({ launchId: launch.body.item.id })).status, 200);
  const shareToken = collection.body.item.shareUrl.split('/').at(-1);
  const shared = await request(ctx.app).get(`/api/collections/share/${shareToken}`);
  assert.equal(shared.status, 200);
  assert.equal(shared.body.item.launches[0].id, launch.body.item.id);
  assert.equal((await request(ctx.app).get(`/api/collections/share/${shareToken}x`)).status, 404);
  assert.equal((await owner.client.get('/api/me/collections')).body.items.length, 0, 'collections stay owner-scoped');

  const reviewPayload = { review: { overallRating: 5, qualityRating: 4, valueRating: 5, experienceRating: 4, wouldRecommend: true } };
  const review = await member.client.post(`/api/brands/${brand.slug}/reviews`).send(reviewPayload);
  assert.equal(review.status, 201, JSON.stringify(review.body));
  assert.equal(review.body.item.count, 1);
  assert.equal(review.body.item.items[0].reviewerName, 'Verified member');
  assert.equal(JSON.stringify(review.body).includes(member.id), false, 'public review output does not expose member identity');
  assert.equal((await member.client.post(`/api/brands/${brand.slug}/reviews`).send(reviewPayload)).status, 200, 'one review per account is updated rather than duplicated');
  assert.equal((await owner.client.post(`/api/brands/${brand.slug}/reviews`).send(reviewPayload)).status, 403, 'business owners cannot review themselves');
  const reviewId = review.body.item.items[0].id;
  assert.equal((await owner.client.post(`/api/reviews/${reviewId}/report`).send({ reason: 'misleading' })).status, 202);
  ctx.db.prepare("UPDATE users SET role = 'moderator' WHERE id = ?").run(owner.id);
  const reviewQueue = await owner.client.get('/api/admin/reviews/reports');
  assert.equal(reviewQueue.status, 200);
  assert.ok(reviewQueue.body.items.some(item => item.reviewId === reviewId));
  assert.equal((await owner.client.post(`/api/admin/reviews/${reviewId}/actions`).send({ action: 'hide' })).status, 200);
  assert.equal((await member.client.get(`/api/brands/${brand.slug}/reviews`)).body.item.count, 0, 'moderated reviews disappear from public summaries');

  const discovered = await member.client.get('/api/discover/businesses?city=Ahmedabad&area=Navrangpura&category=food-beverage&mode=physical&verified=true&latitude=23.0225&longitude=72.5714&radiusKm=10');
  assert.equal(discovered.status, 200, JSON.stringify(discovered.body));
  assert.equal(discovered.body.items.some(item => item.id === brand.id), true);
  const business = discovered.body.items.find(item => item.id === brand.id);
  assert.equal(business.distanceKm, 0);
  assert.equal(business.verified, true);
  assert.equal((await member.client.get('/api/discover/businesses?city=Ahmedabad&sort=most_liked')).body.items[0].id, brand.id);
  assert.equal((await member.client.get('/api/discover/businesses?city=Ahmedabad&sort=most_saved')).body.items[0].id, brand.id);
  assert.equal((await member.client.get('/api/discover/businesses?latitude=91&longitude=72')).status, 422);

  const profileRead = await member.client.get(`/api/brands/${brand.slug}?source=nearby`);
  assert.equal(profileRead.status, 200);
  assert.equal(profileRead.body.item.viewerIsOwner, false);
  assert.equal(profileRead.body.item.links.phone, '+910000000000');
  assert.equal((await member.client.post(`/api/businesses/${brand.id}/events`).send({ eventType: 'website_click', source: 'nearby' })).status, 202);
  assert.equal((await owner.client.post(`/api/businesses/${brand.id}/events`).send({ eventType: 'website_click' })).body.counted, false, 'owner clicks are not counted');
  const dashboard = await owner.client.get('/api/me/dashboard?range=7d');
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.equal(dashboard.body.timezone, 'Asia/Kolkata');
  assert.equal(dashboard.body.totals.profileVisits, 1);
  assert.equal(dashboard.body.totals.websiteClicks, 1);
  assert.equal(dashboard.body.series.length, 7);
  assert.ok(dashboard.body.totals.feedImpressions > 0);
  assert.ok(dashboard.body.sources.some(item => item.source === 'nearby'));
  const weekly = await owner.client.get('/api/me/dashboard?period=weekly');
  const monthly = await owner.client.get('/api/me/dashboard?period=monthly');
  assert.equal(weekly.body.period, 'weekly');
  assert.ok(weekly.body.series.length > 1);
  assert.equal(monthly.body.period, 'monthly');
  assert.ok(monthly.body.series.length > 1);
  const trending = await member.client.get('/api/trending/dashboard');
  assert.ok(['today', 'week', 'month'].every(period => Array.isArray(trending.body[period])));
  assert.ok((await owner.client.get('/api/me/notifications')).body.items.some(item => item.kind === 'launch_ending'));

  const invalidSchedule = await owner.client.patch(`/api/me/launches/${launch.body.item.id}`).send({ launch: { endsAt: new Date(Date.now() + 1_000).toISOString() } });
  assert.equal(invalidSchedule.status, 422, 'an end before launch time is rejected');
  const invalidHours = await owner.client.patch(`/api/me/brands/${brand.id}`).send({ brand: { openingHours: { monday: { open: '09:00', close: '18:00' } } } });
  assert.equal(invalidHours.status, 422, 'opening hours only accept the documented weekday keys');
});
