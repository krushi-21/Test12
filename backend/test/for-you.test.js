import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { openDatabase } from '../db/index.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/lib/security.js';

async function context(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aarambh-for-you-'));
  const db = openDatabase(':memory:');
  const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', uploadDir: path.join(root, 'uploads'),
    mailDir: path.join(root, 'mail'), apiOrigin: 'http://localhost:4000', webOrigin: 'http://localhost:5173',
    cookieSecure: false, smtpHost: '', previewReadOnly: false,
    sessionSecret: 'for-you-isolated-test-session-secret', analyticsSalt: 'for-you-isolated-test-analytics-salt' });
  const app = createApp({ db, config, sendEmail: async () => {} });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  assert.equal(db.name, ':memory:');
  return { db, config, app };
}

function seedUser(db, id, name, email) {
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT INTO users(id, display_name, email, password_hash, email_verified_at, created_at, updated_at)
    VALUES (?, ?, ?, 'synthetic-test-hash', ?, ?, ?)`).run(id, name, email, timestamp, timestamp, timestamp);
}

function seedProfile(db, { id, userId, city, state }) {
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT INTO founder_profiles(id, user_id, slug, display_name, city, state, public_profile, moderation_status, created_at, updated_at)
    VALUES (?, ?, ?, 'Synthetic Test Member', ?, ?, 0, 'active', ?, ?)`).run(id, userId, `profile-${id}`, city, state, timestamp, timestamp);
}

function seedLaunch(db, ownerId, id, { category, city, state, publishedAt }) {
  const timestamp = new Date().toISOString();
  const brandId = `brand-${id}`;
  db.prepare(`INSERT INTO brands(id, owner_user_id, slug, name, category, city, state, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)`).run(brandId, ownerId, `slug-${brandId}`, `Synthetic ${id}`, category, city, state, timestamp, timestamp);
  db.prepare(`INSERT INTO launches(id, brand_id, owner_user_id, slug, title, launch_type, category, summary, story, status, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'product', ?, 'Synthetic test card', 'Synthetic test detail', 'published', ?, ?, ?)`)
    .run(id, brandId, ownerId, `slug-${id}`, `Synthetic ${id} launch`, category, publishedAt, timestamp, timestamp);
  return { id, brandId, category, city, state, publishedAt };
}

function seedEvent(db, { id, launch, eventType, actorUserId = null, qualified = 1, createdAt = new Date().toISOString() }) {
  db.prepare(`INSERT INTO engagement_events(id, event_type, launch_id, brand_id, actor_user_id, actor_key, destination,
      local_day, qualified, created_at, retracted_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL)`)
    .run(id, eventType, launch.id, launch.brandId, actorUserId, `synthetic-key-${id}`, createdAt.slice(0, 10), qualified, createdAt);
}

function rowCounts(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n]));
}

test('For You personalizes cards, applies filters and opaque cursor pages, and stays read-only', async t => {
  const ctx = await context(t);
  const { db, app } = ctx;
  seedUser(db, 'synthetic-owner', 'Synthetic Owner', 'owner@for-you.invalid');
  seedUser(db, 'synthetic-member', 'Synthetic Member', 'member@for-you.invalid');
  seedUser(db, 'synthetic-actor', 'Synthetic Actor', 'actor@for-you.invalid');
  seedProfile(db, { id: 'synthetic-profile', userId: 'synthetic-member', city: 'Ahmedabad', state: 'Gujarat' });
  db.prepare("INSERT INTO follows(user_id, target_type, target_id, created_at) VALUES ('synthetic-member', 'category', 'food-beverage', ?)")
    .run(new Date().toISOString());

  const sharedPublicationTime = new Date(Date.now() - 86_400_000).toISOString();
  const localFood = seedLaunch(db, 'synthetic-owner', 'launch-local-food', { category: 'food-beverage', city: 'Ahmedabad', state: 'Gujarat', publishedAt: sharedPublicationTime });
  const stateFood = seedLaunch(db, 'synthetic-owner', 'launch-state-food', { category: 'food-beverage', city: 'Surat', state: 'Gujarat', publishedAt: sharedPublicationTime });
  const recentTech = seedLaunch(db, 'synthetic-owner', 'launch-recent-tech', { category: 'technology-software', city: 'Bengaluru', state: 'Karnataka', publishedAt: sharedPublicationTime });
  const viralArts = seedLaunch(db, 'synthetic-owner', 'launch-viral-arts', { category: 'arts-crafts', city: 'Chennai', state: 'Tamil Nadu', publishedAt: sharedPublicationTime });
  const stableA = seedLaunch(db, 'synthetic-owner', 'launch-stable-a', { category: 'other', city: 'Pune', state: 'Maharashtra', publishedAt: sharedPublicationTime });
  const stableB = seedLaunch(db, 'synthetic-owner', 'launch-stable-b', { category: 'other', city: 'Pune', state: 'Maharashtra', publishedAt: sharedPublicationTime });

  const recent = new Date(Date.now() - 60 * 60_000).toISOString();
  seedEvent(db, { id: 'member-recent-tech-save', launch: recentTech, eventType: 'save', actorUserId: 'synthetic-member', createdAt: recent });
  db.prepare('INSERT INTO saves(user_id, launch_id, created_at) VALUES (?, ?, ?)').run('synthetic-member', recentTech.id, recent);
  for (let index = 0; index < 10; index += 1) {
    seedEvent(db, { id: `viral-aggregate-${index}`, launch: viralArts, eventType: 'like', actorUserId: index % 2 ? 'synthetic-actor' : null, createdAt: recent });
  }
  const memberToken = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(memberToken), 'synthetic-member', new Date().toISOString(), new Date(Date.now() + 86_400_000).toISOString());
  const cookie = `launch_session=${memberToken}`;

  const countsBefore = rowCounts(db);
  const memberFeed = await request(app).get('/api/for-you?limit=20').set('Cookie', cookie);
  assert.equal(memberFeed.status, 200, JSON.stringify(memberFeed.body));
  assert.deepEqual(Object.keys(memberFeed.body).sort(), ['coldStart', 'items', 'nextCursor', 'rankingMode'].sort());
  assert.equal(memberFeed.body.coldStart, false);
  assert.equal(memberFeed.body.rankingMode, 'personalized');
  assert.equal(memberFeed.body.items[0].id, localFood.id, 'city, state, and followed-category signals rank the nearby followed category first');
  assert.equal(memberFeed.body.items[0].recommendationReason, 'Near your selected location');
  assert.ok(memberFeed.body.items.findIndex(item => item.id === recentTech.id) < memberFeed.body.items.findIndex(item => item.id === stableA.id),
    'a recent save adds category affinity above a similarly fresh card with no engagement');
  assert.ok(memberFeed.body.items.every(item => typeof item.recommendationReason === 'string' && item.recommendationReason.length > 0));
  assert.equal(memberFeed.headers['cache-control'], 'private, no-store');
  assert.deepEqual(rowCounts(db), countsBefore, 'serving the personalized feed does not write database rows or events');

  const cityFeed = await request(app).get('/api/for-you?city=Ahmedabad').set('Cookie', cookie);
  assert.equal(cityFeed.status, 200, JSON.stringify(cityFeed.body));
  assert.deepEqual(cityFeed.body.items.map(item => item.id), [localFood.id]);
  const categoryFeed = await request(app).get('/api/for-you?category=technology-software').set('Cookie', cookie);
  assert.equal(categoryFeed.status, 200, JSON.stringify(categoryFeed.body));
  assert.deepEqual(categoryFeed.body.items.map(item => item.id), [recentTech.id]);

  const firstPage = await request(app).get('/api/for-you?limit=1').set('Cookie', cookie);
  assert.equal(firstPage.status, 200);
  assert.ok(firstPage.body.nextCursor);
  const secondPage = await request(app).get(`/api/for-you?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`).set('Cookie', cookie);
  assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
  assert.notEqual(firstPage.body.items[0].id, secondPage.body.items[0].id, 'cursor pages do not repeat the first item');
  assert.equal(secondPage.body.rankingMode, 'personalized');

  for (const query of ['limit=0', 'limit=abc', 'cursor=not-a-cursor', 'category=not-a-category', `city=${'x'.repeat(81)}`]) {
    const invalid = await request(app).get(`/api/for-you?${query}`).set('Cookie', cookie);
    assert.equal(invalid.status, 422, `${query}: ${JSON.stringify(invalid.body)}`);
  }
  assert.deepEqual(rowCounts(db), countsBefore, 'filters, pagination, and invalid requests remain read-only');
});

test('For You cold-start uses stable popular/recent ordering and is allowed in anonymous read-only preview', async t => {
  const ctx = await context(t);
  const { db, config } = ctx;
  seedUser(db, 'synthetic-owner', 'Synthetic Owner', 'owner-cold-start@for-you.invalid');
  seedUser(db, 'synthetic-actor', 'Synthetic Actor', 'actor-cold-start@for-you.invalid');
  const sharedPublicationTime = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const viral = seedLaunch(db, 'synthetic-owner', 'launch-cold-viral', { category: 'arts-crafts', city: 'Jaipur', state: 'Rajasthan', publishedAt: sharedPublicationTime });
  const stableB = seedLaunch(db, 'synthetic-owner', 'launch-cold-stable-b', { category: 'other', city: 'Pune', state: 'Maharashtra', publishedAt: sharedPublicationTime });
  const stableA = seedLaunch(db, 'synthetic-owner', 'launch-cold-stable-a', { category: 'other', city: 'Pune', state: 'Maharashtra', publishedAt: sharedPublicationTime });
  const recent = new Date(Date.now() - 30 * 60_000).toISOString();
  for (let index = 0; index < 8; index += 1) {
    seedEvent(db, { id: `cold-viral-aggregate-${index}`, launch: viral, eventType: 'save', actorUserId: index % 2 ? 'synthetic-actor' : null, createdAt: recent });
  }

  const readOnlyApp = createApp({ db, config: { ...config, previewReadOnly: true }, sendEmail: async () => { throw new Error('For You GET must not send email.'); } });
  const countsBefore = rowCounts(db);
  const anonymous = await request(readOnlyApp).get('/api/for-you');
  assert.equal(anonymous.status, 200, JSON.stringify(anonymous.body));
  assert.equal(anonymous.headers['set-cookie'], undefined);
  assert.equal(anonymous.body.coldStart, true);
  assert.equal(anonymous.body.rankingMode, 'popular_recent');
  assert.equal(anonymous.body.items[0].id, viral.id, 'qualified recent community engagement leads cold-start results');
  const ids = anonymous.body.items.map(item => item.id);
  assert.ok(ids.indexOf(stableA.id) < ids.indexOf(stableB.id), 'publication-time ties use ascending launch ID for stable ordering');
  assert.deepEqual(rowCounts(db), countsBefore, 'anonymous preview reads leave every in-memory table unchanged');

  const repeat = await request(readOnlyApp).get('/api/for-you');
  assert.equal(repeat.status, 200);
  assert.deepEqual(repeat.body.items.map(item => item.id), ids, 'unchanged data produces deterministic cold-start order');
  assert.deepEqual(rowCounts(db), countsBefore);
});
