import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import Database from 'better-sqlite3';
import { openDatabase } from '../db/index.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { localDay, periodBounds } from '../src/lib/time.js';
import { processScheduledWork } from '../src/lib/scheduled-work.js';

async function context(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aarambh-feature-completeness-'));
  const db = openDatabase(':memory:');
  const messages = [];
  const config = loadConfig({
    nodeEnv: 'test', databasePath: ':memory:', uploadDir: path.join(root, 'uploads'), mailDir: path.join(root, 'mail'),
    apiOrigin: 'http://localhost:4000', webOrigin: 'http://localhost:5173', cookieSecure: false,
    sessionSecret: 'feature-completeness-isolated-test-session-secret', analyticsSalt: 'feature-completeness-isolated-test-analytics-salt', previewReadOnly: false
  });
  const app = createApp({ db, config, sendEmail: async message => { messages.push(message); } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { app, db, messages };
}

async function verified(ctx, displayName, email) {
  const client = request.agent(ctx.app);
  const created = await client.post('/api/auth/register').send({ displayName, email, password: 'Feature_Test_Password_2026!' });
  assert.equal(created.status, 202, JSON.stringify(created.body));
  const user = ctx.db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  const link = ctx.messages.at(-1).text.match(/https?:\/\/[^\s]+/u)?.[0];
  assert.ok(link, 'verification message has a local one-time URL');
  const token = new URL(link).searchParams.get('token');
  assert.equal((await client.post('/api/auth/verify-email').send({ token })).status, 200);
  return { client, id: user.id };
}

async function upload(client, purpose) {
  const image = await sharp({ create: { width: 24, height: 20, channels: 3, background: { r: 80, g: 130, b: 95 } } }).png().toBuffer();
  const response = await client.post('/api/uploads').field('purpose', purpose).attach('file', image, { filename: 'synthetic.png', contentType: 'image/png' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.asset;
}

async function ownerBusiness(ctx, owner, name, category = 'food-beverage') {
  const profileResponse = await owner.client.post('/api/me/founder-profile').send({ profile: { displayName: name, bio: 'A synthetic test founder.', city: 'Ahmedabad', state: 'Gujarat', publicProfile: true } });
  assert.equal(profileResponse.status, 201, JSON.stringify(profileResponse.body));
  const logo = await upload(owner.client, 'brand-logo');
  const response = await owner.client.post('/api/me/brands').send({ brand: {
    name, logoUrl: logo.url, description: 'A fictional business used only by isolated API tests.', category,
    websiteUrl: 'https://synthetic-business.invalid', city: 'Ahmedabad', state: 'Gujarat'
  } });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const published = await owner.client.post(`/api/me/brands/${response.body.item.id}/publish`).send({});
  assert.equal(published.status, 200, JSON.stringify(published.body));
  const image = await upload(owner.client, 'launch-carousel');
  return { profile: profileResponse.body.item, brand: published.body.item, image };
}

async function publishLaunch(owner, brand, profile, image, title, launchDate) {
  const launch = {
    title, launchType: 'product', category: brand.category, summary: 'A synthetic upcoming product launch.',
    story: 'This synthetic launch exists only in an in-memory regression test.',
    images: [{ url: image.url, altText: 'Synthetic product image' }], brandId: brand.id, founderIds: [profile.id]
  };
  if (launchDate) launch.launchDate = launchDate;
  const created = await owner.client.post(`/api/me/brands/${brand.id}/launches`).send({ status: 'draft', launch });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await owner.client.post(`/api/me/launches/${created.body.item.id}/publish`).send({});
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.item;
}

test('public collection listing includes only public collections and published launches without writing events', async t => {
  const ctx = await context(t);
  assert.equal(ctx.db.name, ':memory:');
  const owner = await verified(ctx, 'Public Collections Synthetic Owner', 'public-collections-owner@synthetic.example.invalid');
  const { profile, brand, image } = await ownerBusiness(ctx, owner, 'Public Collections Synthetic Business');
  const publishedLaunch = await publishLaunch(owner, brand, profile, image, 'Public Curated Launch');
  const unpublishedLaunch = await publishLaunch(owner, brand, profile, image, 'Draft Curated Launch');

  const publicCollection = await owner.client.post('/api/me/collections').send({
    collection: { name: 'Synthetic Public Guide', description: 'A public curated list.', isPublic: true }
  });
  assert.equal(publicCollection.status, 201, JSON.stringify(publicCollection.body));
  const privateCollection = await owner.client.post('/api/me/collections').send({
    collection: { name: 'Synthetic Private Notes', isPublic: false }
  });
  assert.equal(privateCollection.status, 201, JSON.stringify(privateCollection.body));
  for (const collectionId of [publicCollection.body.item.id, privateCollection.body.item.id]) {
    assert.equal((await owner.client.post(`/api/me/collections/${collectionId}/items`).send({ launchId: publishedLaunch.id })).status, 200);
  }
  assert.equal((await owner.client.post(`/api/me/collections/${publicCollection.body.item.id}/items`).send({ launchId: unpublishedLaunch.id })).status, 200);
  ctx.db.prepare("UPDATE launches SET status = 'draft' WHERE id = ?").run(unpublishedLaunch.id);

  const eventCountBefore = ctx.db.prepare('SELECT COUNT(*) AS n FROM engagement_events').get().n;
  const readOnlyApp = createApp({ db: ctx.db, config: { ...ctx.app.locals.config, previewReadOnly: true } });
  const response = await request(readOnlyApp).get('/api/collections/public');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.items.map(item => item.id), [publicCollection.body.item.id]);
  assert.equal(response.body.items[0].isPublic, true);
  assert.equal(response.body.items[0].launchCount, 1);
  assert.deepEqual(response.body.items[0].launches.map(item => item.id), [publishedLaunch.id]);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM engagement_events').get().n, eventCountBefore);
});

test('discovery applies verified=false and rejects contradictory price bounds', async t => {
  const ctx = await context(t);
  const verifiedOwner = await verified(ctx, 'Verified Synthetic Owner', 'verified-owner@synthetic.example.invalid');
  const unverifiedOwner = await verified(ctx, 'Unverified Synthetic Owner', 'unverified-owner@synthetic.example.invalid');
  const verifiedBusiness = await ownerBusiness(ctx, verifiedOwner, 'Verified Synthetic Business');
  const unverifiedBusiness = await ownerBusiness(ctx, unverifiedOwner, 'Unverified Synthetic Business');
  ctx.db.prepare('UPDATE users SET email_verified_at = NULL WHERE id = ?').run(unverifiedOwner.id);

  const verifiedResults = await request(ctx.app).get('/api/discover/businesses?verified=true');
  assert.equal(verifiedResults.status, 200, JSON.stringify(verifiedResults.body));
  assert.deepEqual(verifiedResults.body.items.map(item => item.id), [verifiedBusiness.brand.id]);
  const unverifiedResults = await request(ctx.app).get('/api/discover/businesses?verified=false');
  assert.equal(unverifiedResults.status, 200, JSON.stringify(unverifiedResults.body));
  assert.deepEqual(unverifiedResults.body.items.map(item => item.id), [unverifiedBusiness.brand.id]);

  const contradictoryRange = await request(ctx.app).get('/api/discover/businesses?priceMin=200&priceMax=100');
  assert.equal(contradictoryRange.status, 422);
  assert.equal(contradictoryRange.body.error.code, 'VALIDATION_ERROR');
});

test('business discovery sort=new orders published synthetic businesses newest first', async t => {
  const ctx = await context(t);
  assert.equal(ctx.db.name, ':memory:');
  const oldOwner = await verified(ctx, 'Old Synthetic Owner', 'old-owner@synthetic.example.invalid');
  const newOwner = await verified(ctx, 'New Synthetic Owner', 'new-owner@synthetic.example.invalid');
  const oldBusiness = await ownerBusiness(ctx, oldOwner, 'Aardvark Old');
  const newBusiness = await ownerBusiness(ctx, newOwner, 'Zebra New');
  ctx.db.prepare('UPDATE brands SET created_at = ? WHERE id = ?').run('2025-01-01T00:00:00.000Z', oldBusiness.brand.id);
  ctx.db.prepare('UPDATE brands SET created_at = ? WHERE id = ?').run('2025-02-01T00:00:00.000Z', newBusiness.brand.id);

  const response = await request(ctx.app).get('/api/discover/businesses?sort=new');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.items.map(item => item.name), ['Zebra New', 'Aardvark Old']);
});

test('date-only schedules appear in upcoming lifecycle and deliver one due reminder', async t => {
  const ctx = await context(t);
  const owner = await verified(ctx, 'Date Only Owner', 'date-owner@synthetic.example.invalid');
  const member = await verified(ctx, 'Date Only Member', 'date-member@synthetic.example.invalid');
  const { profile, brand, image } = await ownerBusiness(ctx, owner, 'Date Only Synthetic Business');
  const launchDate = localDay(new Date(Date.now() + 48 * 60 * 60_000));
  const launch = await publishLaunch(owner, brand, profile, image, 'Date Only Synthetic Launch', launchDate);

  const lifecycle = await member.client.get(`/api/launches/${launch.slug}/lifecycle`);
  assert.equal(lifecycle.status, 200, JSON.stringify(lifecycle.body));
  assert.equal(lifecycle.body.lifecycleStage, 'coming_soon');
  assert.equal(lifecycle.body.launchAt, launchDate);
  assert.equal(lifecycle.body.countdownSeconds, 0, 'date-only schedules do not invent an exact launch time');
  const upcoming = await member.client.get('/api/launches/upcoming');
  assert.equal(upcoming.status, 200, JSON.stringify(upcoming.body));
  assert.ok(upcoming.body.items.some(item => item.id === launch.id && item.launchAt === launchDate));

  assert.equal((await member.client.put(`/api/launches/${launch.slug}/notify`).send({})).status, 200);
  const beforeDate = await member.client.get('/api/me/notifications');
  assert.equal(beforeDate.body.items.some(item => item.kind === 'launch_reminder'), false);
  ctx.db.prepare("UPDATE launches SET launch_date = '2000-01-01' WHERE id = ?").run(launch.id);
  assert.equal(processScheduledWork(ctx.db).reminderCount, 1, 'the scheduled worker delivers due reminders without a notification-page read');
  const due = await member.client.get('/api/me/notifications');
  assert.equal(due.status, 200, JSON.stringify(due.body));
  assert.equal(due.body.items.filter(item => item.kind === 'launch_reminder').length, 1);
  await member.client.get('/api/me/notifications');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = ? AND kind = 'launch_reminder'").get(member.id).n, 1);
  assert.ok(ctx.db.prepare('SELECT notified_at FROM launch_alert_subscriptions WHERE user_id = ? AND launch_id = ?').get(member.id, launch.id).notified_at);
  assert.equal((await member.client.delete(`/api/launches/${launch.slug}/notify`)).status, 200);
  assert.equal((await member.client.put(`/api/launches/${launch.slug}/notify`).send({})).status, 409, 'expired date-only launches cannot accept new alert subscriptions');
});

test('business saves are private, idempotent, and notify the business owner', async t => {
  const ctx = await context(t);
  const owner = await verified(ctx, 'Saved Business Synthetic Owner', 'saved-business-owner@synthetic.example.invalid');
  const memberName = 'Saved Business Synthetic Member';
  const memberEmail = 'saved-business-member@synthetic.example.invalid';
  const member = await verified(ctx, memberName, memberEmail);
  const { brand } = await ownerBusiness(ctx, owner, 'Saved Synthetic Business');

  const anonymousSave = await request(ctx.app).put(`/api/businesses/${brand.slug}/save`).send({});
  assert.equal(anonymousSave.status, 401, JSON.stringify(anonymousSave.body));
  assert.equal(anonymousSave.body.error.code, 'AUTH_REQUIRED');
  const pending = request.agent(ctx.app);
  const pendingEmail = 'saved-business-unverified@synthetic.example.invalid';
  const pendingPassword = 'Unverified_Test_Password_2026!';
  assert.equal((await pending.post('/api/auth/register').send({
    displayName: 'Unverified Synthetic Member', email: pendingEmail, password: pendingPassword
  })).status, 202);
  const pendingLogin = await pending.post('/api/auth/login').send({ email: pendingEmail, password: pendingPassword });
  assert.equal(pendingLogin.status, 200, JSON.stringify(pendingLogin.body));
  assert.equal(pendingLogin.body.user.emailVerified, false);
  const unverifiedSave = await pending.put(`/api/businesses/${brand.slug}/save`).send({});
  assert.equal(unverifiedSave.status, 403, JSON.stringify(unverifiedSave.body));
  assert.equal(unverifiedSave.body.error.code, 'EMAIL_NOT_VERIFIED');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM business_saves WHERE brand_id = ?').get(brand.id).n, 0,
    'unauthorized saves do not change list membership');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM business_events WHERE brand_id = ? AND event_type = 'business_save'").get(brand.id).n, 0,
    'unauthorized saves do not create analytics');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = ? AND kind = 'business_save'").get(owner.id).n, 0,
    'unauthorized saves do not notify the owner');

  assert.equal((await member.client.put(`/api/businesses/${brand.slug}/save`).send({})).status, 200);
  assert.equal((await member.client.put(`/api/businesses/${brand.id}/save`).send({})).body.saved, true, 'repeated saves are idempotent');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM business_events WHERE brand_id = ? AND event_type = 'business_save'").get(brand.id).n, 1,
    'repeated saves do not create duplicate analytics events');
  const ownerProfileBeforeSelfSave = await owner.client.get(`/api/brands/${brand.slug}`);
  assert.equal(ownerProfileBeforeSelfSave.status, 200, JSON.stringify(ownerProfileBeforeSelfSave.body));
  assert.equal(ownerProfileBeforeSelfSave.body.item.viewerIsOwner, true,
    'the profile exposes viewerIsOwner so its UI can guard against self-save');
  assert.equal(ownerProfileBeforeSelfSave.body.item.isSaved, false);
  const ownerDiscoveryBeforeSelfSave = await owner.client.get('/api/discover/businesses');
  const ownerDiscoveryCardBeforeSelfSave = ownerDiscoveryBeforeSelfSave.body.items.find(item => item.id === brand.id);
  assert.ok(ownerDiscoveryCardBeforeSelfSave, 'the owner business appears as a discovery card');
  assert.equal(Object.hasOwn(ownerDiscoveryCardBeforeSelfSave, 'viewerIsOwner'), false,
    'discovery cards do not expose viewerIsOwner');
  assert.equal(ownerDiscoveryCardBeforeSelfSave.isSaved, false);
  assert.equal(ownerDiscoveryCardBeforeSelfSave.saveCount, ownerProfileBeforeSelfSave.body.item.saveCount);

  const savesBeforeSelfSave = ctx.db.prepare('SELECT user_id, brand_id, created_at FROM business_saves WHERE brand_id = ? ORDER BY user_id').all(brand.id);
  const analyticsBeforeSelfSave = ctx.db.prepare(`SELECT id, event_type, brand_id, actor_key, source, local_day, created_at
    FROM business_events WHERE brand_id = ? AND event_type = 'business_save' ORDER BY id`).all(brand.id);
  const noticesBeforeSelfSave = ctx.db.prepare(`SELECT id, kind, subject, message, created_at, read_at
    FROM user_notifications WHERE user_id = ? AND kind = 'business_save' ORDER BY id`).all(owner.id);
  const dashboardSavesBeforeSelfSave = (await owner.client.get('/api/me/dashboard?range=7d')).body.totals.saves;
  const selfSave = await owner.client.put(`/api/businesses/${brand.id}/save`).send({});
  assert.equal(selfSave.status, 403, JSON.stringify(selfSave.body));
  assert.equal(selfSave.body.error.code, 'FORBIDDEN');
  assert.deepEqual(ctx.db.prepare('SELECT user_id, brand_id, created_at FROM business_saves WHERE brand_id = ? ORDER BY user_id').all(brand.id),
    savesBeforeSelfSave, 'a rejected self-save does not add or alter a save row');
  assert.equal(ctx.db.prepare('SELECT 1 FROM business_saves WHERE user_id = ? AND brand_id = ?').get(owner.id, brand.id), undefined,
    'a rejected self-save does not add an owner save row');
  assert.deepEqual(ctx.db.prepare(`SELECT id, event_type, brand_id, actor_key, source, local_day, created_at
    FROM business_events WHERE brand_id = ? AND event_type = 'business_save' ORDER BY id`).all(brand.id),
  analyticsBeforeSelfSave, 'a rejected self-save does not add or alter save analytics');
  assert.equal((await owner.client.get('/api/me/dashboard?range=7d')).body.totals.saves, dashboardSavesBeforeSelfSave,
    'a rejected self-save does not change dashboard save analytics');
  assert.deepEqual(ctx.db.prepare(`SELECT id, kind, subject, message, created_at, read_at
    FROM user_notifications WHERE user_id = ? AND kind = 'business_save' ORDER BY id`).all(owner.id),
  noticesBeforeSelfSave, 'a rejected self-save does not add or alter an owner notice');
  const ownerProfileAfterSelfSave = await owner.client.get(`/api/brands/${brand.slug}`);
  assert.equal(ownerProfileAfterSelfSave.body.item.viewerIsOwner, true);
  assert.equal(ownerProfileAfterSelfSave.body.item.isSaved, false, 'the rejected self-save leaves profile isSaved unchanged');
  assert.equal(ownerProfileAfterSelfSave.body.item.saveCount, ownerProfileBeforeSelfSave.body.item.saveCount,
    'the rejected self-save leaves the profile save count unchanged');
  const ownerDiscoveryAfterSelfSave = await owner.client.get('/api/discover/businesses');
  const ownerDiscoveryCardAfterSelfSave = ownerDiscoveryAfterSelfSave.body.items.find(item => item.id === brand.id);
  assert.equal(Object.hasOwn(ownerDiscoveryCardAfterSelfSave, 'viewerIsOwner'), false);
  assert.equal(ownerDiscoveryCardAfterSelfSave.isSaved, ownerDiscoveryCardBeforeSelfSave.isSaved,
    'the rejected self-save leaves discovery-card isSaved unchanged');
  assert.equal(ownerDiscoveryCardAfterSelfSave.saveCount, ownerDiscoveryCardBeforeSelfSave.saveCount,
    'the rejected self-save leaves the discovery-card save count unchanged');

  const memberProfile = await member.client.get(`/api/brands/${brand.slug}`);
  assert.equal(memberProfile.status, 200, JSON.stringify(memberProfile.body));
  assert.equal(memberProfile.body.item.isSaved, true);
  assert.equal(memberProfile.body.item.saveCount, 1);
  const anonymousProfile = await request(ctx.app).get(`/api/brands/${brand.slug}`);
  assert.equal(anonymousProfile.body.item.isSaved, false);
  assert.equal(anonymousProfile.body.item.saveCount, 1);

  const saved = await member.client.get('/api/me/saved-businesses');
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.items.map(item => item.id), [brand.id]);
  assert.equal(saved.body.items[0].name, brand.name);
  const discovery = await member.client.get('/api/discover/businesses');
  assert.equal(discovery.body.items.find(item => item.id === brand.id).isSaved, true);
  assert.equal(discovery.body.items.find(item => item.id === brand.id).saveCount, 1);
  assert.equal((await member.client.get('/api/discover/businesses?sort=most_saved')).body.items[0].id, brand.id);
  assert.equal((await request(ctx.app).get('/api/discover/businesses')).body.items.find(item => item.id === brand.id).isSaved, false);

  const saveEvent = ctx.db.prepare("SELECT actor_key FROM business_events WHERE brand_id = ? AND event_type = 'business_save'").get(brand.id);
  assert.ok(saveEvent);
  assert.notEqual(saveEvent.actor_key, member.id, 'analytics stores no member account identifier');
  assert.match(saveEvent.actor_key, /^[a-f0-9]{64}$/u, 'analytics actor is represented only by a salted digest');
  const dashboard = await owner.client.get('/api/me/dashboard?range=7d');
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.equal(dashboard.body.totals.saves, 1, 'the first business save contributes once to owner analytics');

  const ownerNotifications = await owner.client.get('/api/me/notifications');
  assert.equal(ownerNotifications.status, 200);
  const saveNotifications = ownerNotifications.body.items.filter(item => item.kind === 'business_save');
  assert.equal(saveNotifications.length, 1, 'repeated saves do not create duplicate notices');
  const saveNoticeText = `${saveNotifications[0].subject}\n${saveNotifications[0].message}`;
  for (const privateValue of [member.id, memberName, memberEmail, saveEvent.actor_key]) {
    assert.equal(saveNoticeText.includes(privateValue), false, 'save notices do not reveal the saver identity or analytics digest');
  }
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM business_saves WHERE brand_id = ?').get(brand.id).n, 1);

  const extraBusinesses = [
    { id: 'pagination-saved-business-2', slug: 'pagination-saved-business-2', name: 'Pagination Synthetic Business Two', savedAt: '2026-10-08T00:00:02.000Z' },
    { id: 'pagination-saved-business-3', slug: 'pagination-saved-business-3', name: 'Pagination Synthetic Business Three', savedAt: '2026-10-08T00:00:01.000Z' }
  ];
  const insertBusiness = ctx.db.prepare(`INSERT INTO brands(id, owner_user_id, slug, name, category, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'food-beverage', 'published', ?, ?)`);
  for (const business of extraBusinesses) {
    insertBusiness.run(business.id, owner.id, business.slug, business.name, business.savedAt, business.savedAt);
    const response = await member.client.put(`/api/businesses/${business.slug}/save`).send({});
    assert.equal(response.status, 200, JSON.stringify(response.body));
    ctx.db.prepare('UPDATE business_saves SET created_at = ? WHERE user_id = ? AND brand_id = ?')
      .run(business.savedAt, member.id, business.id);
  }
  ctx.db.prepare('UPDATE business_saves SET created_at = ? WHERE user_id = ? AND brand_id = ?')
    .run('2026-10-08T00:00:03.000Z', member.id, brand.id);

  const firstSavedPage = await member.client.get('/api/me/saved-businesses').query({ limit: 1 });
  assert.equal(firstSavedPage.status, 200, JSON.stringify(firstSavedPage.body));
  assert.deepEqual(firstSavedPage.body.items.map(item => item.id), [brand.id]);
  assert.ok(firstSavedPage.body.nextCursor, 'a non-final saved-business page returns nextCursor');
  const secondSavedPage = await member.client.get('/api/me/saved-businesses')
    .query({ limit: 1, cursor: firstSavedPage.body.nextCursor });
  assert.equal(secondSavedPage.status, 200, JSON.stringify(secondSavedPage.body));
  assert.deepEqual(secondSavedPage.body.items.map(item => item.id), [extraBusinesses[0].id]);
  assert.ok(secondSavedPage.body.nextCursor, 'an intermediate saved-business page returns the next cursor');
  const thirdSavedPage = await member.client.get('/api/me/saved-businesses')
    .query({ limit: 1, cursor: secondSavedPage.body.nextCursor });
  assert.equal(thirdSavedPage.status, 200, JSON.stringify(thirdSavedPage.body));
  assert.deepEqual(thirdSavedPage.body.items.map(item => item.id), [extraBusinesses[1].id]);
  assert.equal(thirdSavedPage.body.nextCursor, null, 'the final saved-business page has no next cursor');
  const savesBeforeUnsave = (await owner.client.get('/api/me/dashboard?range=7d')).body.totals.saves;
  assert.equal(savesBeforeUnsave, 3);

  assert.equal((await member.client.delete(`/api/businesses/${brand.slug}/save`)).body.saved, false);
  for (const business of extraBusinesses) {
    assert.equal((await member.client.delete(`/api/businesses/${business.slug}/save`)).body.saved, false);
  }
  assert.deepEqual((await member.client.get('/api/me/saved-businesses')).body.items, []);
  const profileAfterRemoval = await member.client.get(`/api/brands/${brand.slug}`);
  assert.equal(profileAfterRemoval.body.item.isSaved, false);
  assert.equal(profileAfterRemoval.body.item.saveCount, 0);
  assert.equal((await member.client.get('/api/discover/businesses')).body.items.find(item => item.id === brand.id).saveCount, 0);
  assert.equal((await owner.client.get('/api/me/dashboard?range=7d')).body.totals.saves, savesBeforeUnsave,
    'historical save analytics remains after unsaving');
});

test('business-save analytics migration preserves existing business events', async t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  const migrationsDirectory = new URL('../db/migrations/', import.meta.url);
  const migrations = (await fs.readdir(migrationsDirectory))
    .filter(filename => /^\d+_.+\.sql$/u.test(filename) && Number(filename.split('_', 1)[0]) < 8)
    .sort();
  for (const filename of migrations) db.exec(await fs.readFile(new URL(filename, migrationsDirectory), 'utf8'));

  db.pragma('foreign_keys = OFF');
  db.prepare(`INSERT INTO business_events (id, event_type, brand_id, actor_key, source, local_day, created_at)
    VALUES (?, 'profile_view', ?, ?, 'unknown', ?, ?)`).run('legacy-business-event', 'synthetic-brand', 'privacy-safe-digest', '2026-10-08', '2026-10-08T00:00:00.000Z');
  db.exec(await fs.readFile(new URL('008_business_save_analytics.sql', migrationsDirectory), 'utf8'));

  assert.equal(db.prepare('SELECT event_type FROM business_events WHERE id = ?').get('legacy-business-event').event_type, 'profile_view');
  db.prepare(`INSERT INTO business_events (id, event_type, brand_id, actor_key, source, local_day, created_at)
    VALUES (?, 'business_save', ?, ?, 'unknown', ?, ?)`).run('new-business-save-event', 'synthetic-brand', 'another-privacy-safe-digest', '2026-10-08', '2026-10-08T00:01:00.000Z');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM business_events').get().n, 2);
});

test('scheduled draft publication is automatic, idempotent, and not public before its due time', async t => {
  const ctx = await context(t);
  const owner = await verified(ctx, 'Scheduled Publication Synthetic Owner', 'scheduled-publication-owner@synthetic.example.invalid');
  const member = await verified(ctx, 'Scheduled Publication Synthetic Member', 'scheduled-publication-member@synthetic.example.invalid');
  const { profile, brand, image } = await ownerBusiness(ctx, owner, 'Scheduled Publication Synthetic Business');
  assert.equal((await member.client.put(`/api/me/follows/brand/${brand.id}`).send({})).status, 200);
  const launchDate = localDay(new Date(Date.now() + 48 * 60 * 60_000));
  const created = await owner.client.post(`/api/me/brands/${brand.id}/launches`).send({ status: 'draft', launch: {
    title: 'Scheduled Synthetic Launch', launchType: 'product', category: brand.category,
    summary: 'A fictional launch scheduled by an isolated regression test.',
    story: 'No real product or business is represented by this scheduled launch.',
    images: [{ url: image.url, altText: 'Synthetic scheduled launch image' }], brandId: brand.id,
    founderIds: [profile.id], launchDate
  } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const publishAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const scheduled = await owner.client.post(`/api/me/launches/${created.body.item.id}/schedule`).send({ publishAt });
  assert.equal(scheduled.status, 202, JSON.stringify(scheduled.body));
  assert.equal(scheduled.body.item.scheduledAt, publishAt);
  assert.equal(scheduled.body.item.status, 'draft');
  assert.equal((await request(ctx.app).get(`/api/launches/${created.body.item.slug}`)).status, 404);

  const dueAt = new Date(Date.now() + 2 * 60_000);
  ctx.db.prepare('UPDATE scheduled_publications SET publish_at = ? WHERE launch_id = ?').run(new Date(dueAt.getTime() - 60_000).toISOString(), created.body.item.id);
  const processed = processScheduledWork(ctx.db, dueAt);
  assert.equal(processed.publishedCount, 1);
  assert.equal(ctx.db.prepare('SELECT status FROM launches WHERE id = ?').get(created.body.item.id).status, 'published');
  assert.equal(ctx.db.prepare('SELECT 1 FROM scheduled_publications WHERE launch_id = ?').get(created.body.item.id), undefined);
  assert.equal((await request(ctx.app).get(`/api/launches/${created.body.item.slug}`)).status, 200);
  const followerNotices = await member.client.get('/api/me/notifications');
  assert.equal(followerNotices.body.items.filter(item => item.kind === 'followed_launch').length, 1);
  assert.equal(processScheduledWork(ctx.db, dueAt).publishedCount, 0, 'a due launch publishes only once');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM user_notifications WHERE user_id = ? AND kind = 'followed_launch'").get(member.id).n, 1);
});

test('trending has stable ranked offset pages, validates bounds, and counts business events', async t => {
  const ctx = await context(t);
  const owner = await verified(ctx, 'Trending Synthetic Owner', 'trending-owner@synthetic.example.invalid');
  const member = await verified(ctx, 'Trending Synthetic Member', 'trending-member@synthetic.example.invalid');
  const { profile, brand, image } = await ownerBusiness(ctx, owner, 'Trending Synthetic Business');
  const first = await publishLaunch(owner, brand, profile, image, 'Trending Synthetic Launch One');
  const second = await publishLaunch(owner, brand, profile, image, 'Trending Synthetic Launch Two');
  const sharedPublishTime = '2025-01-01T00:00:00.000Z';
  ctx.db.prepare('UPDATE launches SET published_at = ? WHERE id IN (?, ?)').run(sharedPublishTime, first.id, second.id);

  const firstPage = await member.client.get('/api/trending?period=today&limit=1&offset=0');
  const secondPage = await member.client.get('/api/trending?period=today&limit=1&offset=1');
  assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  const orderedIds = [first.id, second.id].sort();
  assert.equal(firstPage.body.items[0].launch.id, orderedIds[0]);
  assert.equal(secondPage.body.items[0].launch.id, orderedIds[1]);
  assert.equal(firstPage.body.items[0].rank, 1);
  assert.equal(secondPage.body.items[0].rank, 2);
  assert.notEqual(firstPage.body.items[0].launch.id, secondPage.body.items[0].launch.id);

  for (const query of ['limit=0', 'limit=abc', 'limit=101', 'offset=-1', 'offset=abc']) {
    const invalid = await member.client.get(`/api/trending?${query}`);
    assert.equal(invalid.status, 422, `${query}: ${JSON.stringify(invalid.body)}`);
  }

  assert.equal((await member.client.post(`/api/businesses/${brand.id}/events`).send({ eventType: 'website_click', source: 'nearby' })).status, 202);
  assert.equal((await member.client.put(`/api/launches/${first.id}/like`).send({})).status, 200);
  assert.equal((await member.client.put(`/api/launches/${second.id}/like`).send({})).status, 200);
  const rising = await member.client.get('/api/trending?period=rising');
  assert.equal(rising.status, 200, JSON.stringify(rising.body));
  assert.equal(rising.body.risingBusinessEventCount, 1);
});

test('homepage discovery supports monthly business ranks, popular categories, broad founder search, new launches, and local filters', async t => {
  const ctx = await context(t);
  const ownerA = await verified(ctx, 'Local Guide Founder', 'local-guide-founder@synthetic.example.invalid');
  const ownerB = await verified(ctx, 'Technology Founder', 'technology-founder@synthetic.example.invalid');
  const member = await verified(ctx, 'Homepage Synthetic Member', 'homepage-member@synthetic.example.invalid');
  const privateOwner = await verified(ctx, 'Private Directory Owner', 'private-directory-owner@synthetic.example.invalid');
  const businessA = await ownerBusiness(ctx, ownerA, 'Guide Market Outfitters', 'food-beverage');
  const businessB = await ownerBusiness(ctx, ownerB, 'Synthetic Technology Studio', 'technology-software');
  const publicBrandLink = await ownerA.client.patch('/api/me/founder-profile').send({ profile: {
    displayName: 'Local Guide Founder', publicBrandIds: [businessA.brand.id]
  } });
  assert.equal(publicBrandLink.status, 200, JSON.stringify(publicBrandLink.body));
  const privateProfile = await privateOwner.client.post('/api/me/founder-profile').send({ profile: {
    displayName: 'Private Search Person', bio: 'Synthetic private founder profile.', city: 'Ahmedabad', state: 'Gujarat', publicProfile: false
  } });
  assert.equal(privateProfile.status, 201, JSON.stringify(privateProfile.body));

  const first = await publishLaunch(ownerA, businessA.brand, businessA.profile, businessA.image, 'Local Food Launch One');
  const second = await publishLaunch(ownerA, businessA.brand, businessA.profile, businessA.image, 'Local Food Launch Two');
  const third = await publishLaunch(ownerB, businessB.brand, businessB.profile, businessB.image, 'Technology Launch');
  const now = Date.now();
  for (const [index, launch] of [first, second, third].entries()) {
    ctx.db.prepare('UPDATE launches SET published_at = ? WHERE id = ?').run(new Date(now - (3 - index) * 60_000).toISOString(), launch.id);
  }

  const bounds = periodBounds('monthly');
  const insertEvent = ctx.db.prepare(`INSERT INTO engagement_events
    (id, event_type, launch_id, brand_id, actor_user_id, actor_key, destination, local_day, qualified, created_at, retracted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const record = (id, eventType, launch, secondOffset, qualified = 1) => insertEvent.run(
    `synthetic-homepage-event-${id}`, eventType, launch.id, launch.brandId, member.id, `synthetic-actor-${id}`,
    eventType === 'click_out' ? 'website' : null, localDay(), qualified,
    new Date(new Date(bounds.start).getTime() + secondOffset * 1000).toISOString(), null
  );
  record(1, 'like', first, 0);
  record(2, 'save', first, 1);
  record(3, 'click_out', first, 2);
  record(4, 'like', second, 3);
  record(5, 'like', third, 4);
  record(6, 'save', third, 5, 0);

  const businessRanks = await request(ctx.app).get('/api/businesses/leaderboard?period=monthly&limit=10');
  assert.equal(businessRanks.status, 200, JSON.stringify(businessRanks.body));
  assert.equal(businessRanks.body.timezone, 'Asia/Kolkata');
  assert.equal(businessRanks.body.period, 'monthly');
  assert.equal(businessRanks.body.items[0].business.id, businessA.brand.id);
  assert.equal(businessRanks.body.items[0].score, 7, 'monthly business score sums qualified activity across eligible launches');
  assert.equal(businessRanks.body.items[1].business.id, businessB.brand.id);
  assert.equal(businessRanks.body.items[1].score, 1, 'unqualified events do not affect business rank');
  const categoryRanks = await request(ctx.app).get('/api/businesses/leaderboard?period=monthly&category=technology-software');
  assert.equal(categoryRanks.status, 200, JSON.stringify(categoryRanks.body));
  assert.equal(categoryRanks.body.eligibleCount, 1);
  assert.equal(categoryRanks.body.items[0].business.id, businessB.brand.id);
  assert.equal((await request(ctx.app).get('/api/businesses/leaderboard?period=daily')).status, 422);

  const popular = await request(ctx.app).get('/api/categories/popular?limit=10');
  assert.equal(popular.status, 200, JSON.stringify(popular.body));
  assert.deepEqual(popular.body.categories.slice(0, 2).map(item => [item.id, item.launchCount]), [
    ['food-beverage', 2], ['technology-software', 1]
  ]);
  assert.equal((await request(ctx.app).get('/api/categories/popular?limit=0')).status, 422);

  const founderByName = await request(ctx.app).get('/api/founders?query=Local%20Guide&city=Ahmedabad');
  assert.equal(founderByName.status, 200, JSON.stringify(founderByName.body));
  assert.equal(founderByName.body.items.length, 1);
  assert.equal(founderByName.body.items[0].displayName, 'Local Guide Founder');
  const founderByPublicBrand = await request(ctx.app).get('/api/founders?query=Outfitters');
  assert.equal(founderByPublicBrand.status, 200, JSON.stringify(founderByPublicBrand.body));
  assert.equal(founderByPublicBrand.body.items[0].id, businessA.profile.id, 'public linked brand names can find their founders');
  const privateFounderSearch = await request(ctx.app).get('/api/founders?query=Private%20Search%20Person');
  assert.equal(privateFounderSearch.status, 200);
  assert.deepEqual(privateFounderSearch.body.items, [], 'private and moderated profiles are omitted from the public directory');
  assert.equal(JSON.stringify(founderByName.body).includes('local-guide-founder@synthetic.example.invalid'), false);
  assert.equal(founderByName.body.items[0].financial, undefined);

  const newLaunches = await request(ctx.app).get('/api/launches?sort=new&newlyLaunched=true&limit=10');
  assert.equal(newLaunches.status, 200, JSON.stringify(newLaunches.body));
  assert.equal(newLaunches.body.items[0].id, third.id, 'New Launches are ordered by most recent publication');
  const localFiltered = await request(ctx.app).get('/api/launches?city=Ahmedabad&category=food-beverage&sort=new&limit=10');
  assert.equal(localFiltered.status, 200, JSON.stringify(localFiltered.body));
  assert.deepEqual(localFiltered.body.items.map(item => item.id), [second.id, first.id]);
  const localBusinesses = await request(ctx.app).get('/api/discover/businesses?city=Ahmedabad&category=food-beverage&sort=new');
  assert.equal(localBusinesses.status, 200, JSON.stringify(localBusinesses.body));
  assert.deepEqual(localBusinesses.body.items.map(item => item.id), [businessA.brand.id]);
});
