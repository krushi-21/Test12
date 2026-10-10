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
import { createEmailSender } from '../src/lib/email.js';

async function makeContext(t, extraConfig = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'launch-api-'));
  const db = openDatabase(':memory:', { migrate: true });
  const messages = [];
  const config = loadConfig({
    nodeEnv: 'test', databasePath: ':memory:', uploadDir: path.join(root, 'uploads'), mailDir: path.join(root, 'mail'),
    apiOrigin: 'http://localhost:4000', webOrigin: 'http://localhost:5173', cookieSecure: false,
    sessionSecret: 'test-session-secret-with-32-or-more-bytes', analyticsSalt: 'test-analytics-salt-with-32-or-more-bytes',
    suspiciousClickThreshold: 2, ...extraConfig
  });
  const app = createApp({ db, config, sendEmail: async message => { messages.push(message); } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { app, db, config, messages };
}

function tokenFrom(message) {
  const link = message.text.match(/https?:\/\/[^\s]+/u)?.[0];
  assert.ok(link, 'email should contain a one-time link');
  return new URL(link).searchParams.get('token');
}

function agentWithHeaders(app, headers = {}) {
  const agent = request.agent(app);
  return Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method, (...args) => {
    const req = agent[method](...args);
    for (const [name, value] of Object.entries(headers)) req.set(name, value);
    return req;
  }]));
}

async function verifiedUser(ctx, displayName, email, password = 'launch-platform-test-password', headers = {}) {
  const client = agentWithHeaders(ctx.app, headers);
  const created = await client.post('/api/auth/register').send({ displayName, email, password });
  assert.equal(created.status, 202);
  assert.deepEqual(created.body, { verificationRequired: true });
  assert.ok(!JSON.stringify(created.body).includes('token'));
  const user = ctx.db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email.toLowerCase());
  assert.ok(user);
  assert.notEqual(user.password_hash, password);
  const token = tokenFrom(ctx.messages.at(-1));
  const tokenHash = ctx.db.prepare("SELECT token_hash FROM email_tokens WHERE user_id = ? AND purpose = 'verify'").get(user.id).token_hash;
  assert.notEqual(tokenHash, token);
  const verified = await client.post('/api/auth/verify-email').send({ token });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.emailVerified, true);
  const sessionCookie = verified.headers['set-cookie']?.[0]?.split(';', 1)[0];
  const replay = await client.post('/api/auth/verify-email').send({ token });
  assert.equal(replay.status, 400);
  return { client, userId: user.id, displayName, sessionCookie };
}

async function uploadImage(client, purpose, background = { r: 42, g: 120, b: 212 }) {
  const buffer = await sharp({ create: { width: 24, height: 18, channels: 3, background } }).png().toBuffer();
  const response = await client.post('/api/uploads').field('purpose', purpose)
    .attach('file', buffer, { filename: 'asset.png', contentType: 'image/png' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.asset;
}

async function makePublishedBrand(owner, name, logoUrl) {
  const created = await owner.client.post('/api/me/brands').send({ brand: {
    name, logoUrl, description: `${name} makes products for small businesses.`, category: 'technology-software',
    websiteUrl: 'https://example.com'
  } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const brand = created.body.item;
  assert.equal(brand.status, 'draft');
  const published = await owner.client.post(`/api/me/brands/${brand.id}/publish`).send({});
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body.item;
}

async function makeLaunch(owner, brand, profileId, imageUrl, title, status = 'published') {
  const response = await owner.client.post(`/api/me/brands/${brand.id}/launches`).send({
    status,
    launch: {
      title, launchType: 'product', category: 'technology-software', summary: `${title} for growing teams.`,
      story: `${title} helps Indian small businesses launch and grow.`, images: [{ url: imageUrl, altText: `${title} product package` }],
      brandId: brand.id, founderIds: [profileId], priceInrPaise: 129900
    }
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.item;
}

test('email verification, cookie session, non-enumerating reset, and session invalidation', async t => {
  const ctx = await makeContext(t, { previewReadOnly: false });
  const user = await verifiedUser(ctx, 'Auth Founder', 'AUTH@example.com');
  const me = await user.client.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'auth@example.com');
  assert.equal(me.body.user.emailVerified, true);
  assert.equal(me.headers['set-cookie'], undefined, 'the session is established at verification, not exposed in JSON');

  const badLogin = await request(ctx.app).post('/api/auth/login').send({ email: 'auth@example.com', password: 'wrong-password-123' });
  assert.equal(badLogin.status, 401);
  const unknownForgot = await request(ctx.app).post('/api/auth/password/forgot').send({ email: 'missing@example.com' });
  assert.equal(unknownForgot.status, 202);
  assert.deepEqual(unknownForgot.body, { accepted: true });
  const forgot = await request(ctx.app).post('/api/auth/password/forgot').send({ email: 'auth@example.com' });
  assert.equal(forgot.status, 202);
  const resetToken = tokenFrom(ctx.messages.at(-1));
  const resetHash = ctx.db.prepare("SELECT token_hash FROM email_tokens WHERE user_id = ? AND purpose = 'reset'").get(user.userId).token_hash;
  assert.notEqual(resetHash, resetToken);
  const reset = await request(ctx.app).post('/api/auth/password/reset').send({ token: resetToken, password: 'another-strong-password' });
  assert.equal(reset.status, 204);
  assert.equal((await user.client.get('/api/me')).status, 401);
  const replay = await request(ctx.app).post('/api/auth/password/reset').send({ token: resetToken, password: 'third-strong-password' });
  assert.equal(replay.status, 400);
  const newLogin = request.agent(ctx.app);
  assert.equal((await newLogin.post('/api/auth/login').send({ email: 'auth@example.com', password: 'another-strong-password' })).status, 200);
  assert.equal((await newLogin.get('/api/me')).status, 200);
});

test('multi-brand workspace, private-by-default profile data, weighted launch ranking, analytics, and moderation appeal', async t => {
  const ctx = await makeContext(t, { previewReadOnly: false });
  const owner = await verifiedUser(ctx, 'Owner Name', 'owner@example.com');
  const member = await verifiedUser(ctx, 'Member Name', 'member@example.com');
  const secondMember = await verifiedUser(ctx, 'Second Member', 'second@example.com');
  const moderator = await verifiedUser(ctx, 'Moderator Name', 'moderator@example.com');
  ctx.db.prepare("UPDATE users SET role = 'moderator' WHERE id = ?").run(moderator.userId);

  const profileCreated = await owner.client.post('/api/me/founder-profile').send({ profile: {
    displayName: 'Public Founder', publicProfile: true, pronouns: 'they/them', interests: ['Craft', 'Community'],
    financial: { revenueRange: '₹5–10 lakh', revenuePeriod: 'monthly' }
  } });
  assert.equal(profileCreated.status, 201, JSON.stringify(profileCreated.body));
  const profileId = profileCreated.body.item.id;
  assert.equal(profileCreated.body.item.financial.revenuePublic, false);
  assert.equal(profileCreated.body.item.pronouns, 'they/them');
  assert.deepEqual(profileCreated.body.item.interests, ['Craft', 'Community']);

  const logo1 = await uploadImage(owner.client, 'brand-logo');
  const logo2 = await uploadImage(owner.client, 'brand-logo', { r: 110, g: 72, b: 210 });
  const carousel = await uploadImage(owner.client, 'launch-carousel');
  const privateLogo = await owner.client.get(`/api/media/${logo1.id}`);
  assert.equal(privateLogo.status, 200);
  assert.equal(privateLogo.headers['cache-control'], 'private, no-store');
  assert.equal((await member.client.get(`/api/media/${logo1.id}`)).status, 404);
  assert.equal((await request(ctx.app).get(`/api/media/${logo1.id}`)).status, 404);
  const brand1 = await makePublishedBrand(owner, 'Northstar Labs', logo1.url);
  const brand2 = await makePublishedBrand(owner, 'Studio South', logo2.url);
  const publicLogo = await request(ctx.app).get(`/api/media/${logo1.id}`);
  assert.equal(publicLogo.status, 200);
  assert.equal(publicLogo.headers['cache-control'], 'public, max-age=300, must-revalidate');
  assert.equal((await owner.client.get('/api/me/brands')).body.items.length, 2);
  const profilePatch = await owner.client.patch('/api/me/founder-profile').send({ profile: { publicBrandIds: [brand1.id] } });
  assert.equal(profilePatch.status, 200);
  const publicProfileBeforeOptIn = await request(ctx.app).get(`/api/founders/${profileId}`);
  assert.equal(publicProfileBeforeOptIn.status, 200);
  assert.equal(publicProfileBeforeOptIn.body.item.brands.length, 1);
  assert.equal(publicProfileBeforeOptIn.body.item.brands[0].id, brand1.id);
  assert.equal(publicProfileBeforeOptIn.body.item.financial, undefined);
  assert.equal(publicProfileBeforeOptIn.body.item.pronouns, 'they/them');
  assert.deepEqual(publicProfileBeforeOptIn.body.item.interests, ['Craft', 'Community']);
  assert.equal(JSON.stringify(publicProfileBeforeOptIn.body).includes('owner@example.com'), false);
  const optIn = await owner.client.patch('/api/me/founder-profile').send({ profile: { financial: { revenuePublic: true } } });
  assert.equal(optIn.status, 200);
  const publicProfileAfterOptIn = await request(ctx.app).get(`/api/founders/${profileId}`);
  assert.equal(publicProfileAfterOptIn.body.item.financial.revenue.range, '₹5–10 lakh');
  assert.equal(publicProfileAfterOptIn.body.item.financial.revenue.label, 'Self-reported, unverified');
  assert.ok(publicProfileAfterOptIn.body.item.financial.revenue.disclosedAt);
  assert.equal((await request(ctx.app).get(`/api/brands/${brand1.slug}`)).body.item.founders[0].id, profileId);
  assert.deepEqual((await request(ctx.app).get(`/api/brands/${brand2.slug}`)).body.item.founders, []);

  const draft = await makeLaunch(owner, brand1, profileId, carousel.url, 'First Launch', 'draft');
  assert.equal(draft.status, 'draft');
  assert.equal((await member.client.get(`/api/media/${carousel.id}`)).status, 404);
  assert.equal((await owner.client.get(`/api/media/${carousel.id}`)).status, 200);
  const published = await owner.client.post(`/api/me/launches/${draft.id}/publish`).send({});
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.item.status, 'published');
  assert.equal((await request(ctx.app).get(`/api/media/${carousel.id}`)).status, 200);
  const launches = [published.body.item];
  for (let index = 2; index <= 5; index += 1) launches.push(await makeLaunch(owner, brand1, profileId, carousel.url, `Launch ${index}`));

  const ownLike = await owner.client.put(`/api/launches/${launches[0].id}/like`).send({});
  assert.equal(ownLike.status, 403, 'owner engagement is excluded');
  const like = await member.client.put(`/api/launches/${launches[0].id}/like`).send({});
  assert.equal(like.status, 200);
  assert.equal(like.body.likeCount, 1);
  assert.equal((await member.client.put(`/api/launches/${launches[0].id}/like`).send({})).body.likeCount, 1);
  assert.equal((await member.client.put(`/api/launches/${launches[0].id}/save`).send({})).body.saved, true);
  const click1 = await member.client.get(`/api/launches/${launches[0].id}/outbound/website`).redirects(0);
  assert.equal(click1.status, 302);
  assert.equal(click1.headers.location, 'https://example.com');
  await member.client.get(`/api/launches/${launches[0].id}/outbound/website`).redirects(0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM engagement_events WHERE launch_id = ? AND event_type = 'click_out' AND qualified = 1").get(launches[0].id).n, 1);

  const publicDetail = await member.client.get(`/api/launches/${launches[0].id}`);
  assert.equal(publicDetail.status, 200);
  assert.equal(publicDetail.body.item.viewerState.liked, true);
  assert.equal(publicDetail.body.item.viewerState.saved, true);
  assert.equal(publicDetail.body.item.engagement.likes, 1);
  assert.equal(publicDetail.body.item.engagement.saves, undefined);
  assert.equal(JSON.stringify(publicDetail.body).includes('owner@example.com'), false);

  const firstPage = await request(ctx.app).get('/api/launches?limit=2');
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.items.length, 2);
  assert.ok(firstPage.body.nextCursor);
  const secondPage = await request(ctx.app).get(`/api/launches?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`);
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.items.length, 2);
  assert.equal(firstPage.body.items.some(item => secondPage.body.items.some(next => next.id === item.id)), false);

  const leaderboard = await request(ctx.app).get('/api/leaderboard?period=weekly&limit=10');
  assert.equal(leaderboard.status, 200, JSON.stringify(leaderboard.body));
  assert.equal(leaderboard.body.forming, false);
  assert.equal(leaderboard.body.timezone, 'Asia/Kolkata');
  const rankedFirst = leaderboard.body.items.find(item => item.launch.id === launches[0].id);
  assert.equal(rankedFirst.score, 6, '1 qualified like + 2 qualified save + 3 qualified outbound click');
  assert.equal(leaderboard.body.scoreFormula.status, 'provisional');
  const monthlyLeaderboard = await request(ctx.app).get('/api/leaderboard?period=monthly&limit=10');
  assert.equal(monthlyLeaderboard.status, 200);
  assert.equal(monthlyLeaderboard.body.period, 'monthly');
  assert.equal(monthlyLeaderboard.body.timezone, 'Asia/Kolkata');
  const forming = await request(ctx.app).get('/api/leaderboard?category=other');
  assert.equal(forming.body.forming, true);
  assert.equal(forming.body.items.length, 0);

  const saved = await member.client.get('/api/me/saved');
  assert.equal(saved.status, 200);
  assert.equal(saved.body.items[0].id, launches[0].id);
  assert.equal((await owner.client.get('/api/me/saved')).body.items.length, 0);
  const analytics = await owner.client.get('/api/me/analytics?range=7d');
  assert.equal(analytics.status, 200);
  assert.equal(analytics.body.totals.likes, 1);
  assert.equal(analytics.body.totals.saves, 1);
  assert.equal(analytics.body.totals.clickOuts, 1, 'a repeated click by the same actor within 30 minutes is suppressed');
  assert.equal(analytics.body.series.length, 7);
  assert.equal(JSON.stringify(analytics.body).includes('member@example.com'), false);

  const holdClick = await secondMember.client.get(`/api/launches/${launches[0].id}/outbound/website`).redirects(0);
  assert.equal(holdClick.status, 302);
  assert.equal(ctx.db.prepare("SELECT source FROM leaderboard_holds WHERE launch_id = ? AND resolved_at IS NULL").get(launches[0].id).source, 'automatic');
  const holdList = await moderator.client.get('/api/admin/leaderboard/holds');
  assert.equal(holdList.status, 200);
  assert.ok(holdList.body.items.some(item => item.launchId === launches[0].id));
  const reinstate = await moderator.client.post(`/api/admin/leaderboard/holds/${launches[0].id}`).send({ action: 'reinstate', reason: 'Reviewed the distinct account activity.' });
  assert.equal(reinstate.status, 200);
  assert.equal(reinstate.body.held, false);

  const report = await member.client.post('/api/reports').send({ subjectType: 'launch', subjectId: launches[0].id, reason: 'misleading', details: 'Please review this launch claim.' });
  assert.equal(report.status, 201);
  assert.equal((await member.client.post('/api/reports').send({ subjectType: 'launch', subjectId: launches[0].id, reason: 'spam' })).status, 409);
  assert.equal((await owner.client.get('/api/admin/reports?status=open')).status, 403);
  const queue = await moderator.client.get('/api/admin/reports?status=open');
  assert.equal(queue.status, 200);
  assert.equal(queue.body.items[0].reporterUserId, undefined);
  const pause = await moderator.client.post(`/api/admin/reports/${report.body.id}/actions`).send({ action: 'pause', reason: 'The claim requires correction before republication.' });
  assert.equal(pause.status, 200);
  assert.equal(pause.body.subjectStatus, 'paused');
  assert.equal(pause.body.report.moderationHistory[0].action, 'pause');
  assert.equal((await owner.client.post(`/api/me/launches/${launches[0].id}/publish`).send({})).status, 409);
  assert.equal((await owner.client.post(`/api/me/launches/${launches[0].id}/archive`).send({})).status, 409);
  assert.equal((await request(ctx.app).get(`/api/launches/${launches[0].id}`)).status, 404);
  const appeal = await owner.client.post('/api/me/moderation/appeals').send({ subjectType: 'launch', subjectId: launches[0].id, reason: 'We have corrected the product claim.' });
  assert.equal(appeal.status, 201);
  const restore = await moderator.client.post(`/api/admin/appeals/${appeal.body.id}/actions`).send({ action: 'restore', reason: 'Reviewed the correction; restore the launch.' });
  assert.equal(restore.status, 200);
  assert.equal(restore.body.subjectStatus, 'published');
  assert.equal((await request(ctx.app).get(`/api/launches/${launches[0].id}`)).status, 200);
  assert.ok(ctx.db.prepare('SELECT 1 FROM user_notifications WHERE user_id = ?').get(owner.userId));
});

test('upload signatures, safe origins, and validation errors are enforced', async t => {
  const ctx = await makeContext(t, { previewReadOnly: false });
  const user = await verifiedUser(ctx, 'Upload Owner', 'upload@example.com');
  const fakeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const rejected = await user.client.post('/api/uploads').field('purpose', 'brand-logo')
    .attach('file', fakeSvg, { filename: 'logo.svg', contentType: 'image/svg+xml' });
  assert.equal(rejected.status, 422);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM media_assets').get().n, 0);
  const wrongOrigin = await request(ctx.app).get('/api/categories').set('Origin', 'https://evil.example');
  assert.equal(wrongOrigin.status, 403);
  const invalidCategory = await request(ctx.app).get('/api/leaderboard?category=made-up');
  assert.equal(invalidCategory.status, 422);
  const invalidPrice = await request(ctx.app).get('/api/launches?priceMin=-1');
  assert.equal(invalidPrice.status, 422);
  const recoveryRequests = [];
  for (let index = 0; index < 5; index += 1) {
    recoveryRequests.push(await request(ctx.app).post('/api/auth/password/forgot').send({ email: `unknown-${index}@example.com` }));
  }
  assert.equal(recoveryRequests.at(-1).status, 429);
  assert.equal(recoveryRequests.at(-1).body.error.code, 'RATE_LIMITED');
});

test('demo preview permits only anonymous public GETs and leaves every synthetic database row unchanged', async t => {
  const ctx = await makeContext(t, { previewReadOnly: false });
  const owner = await verifiedUser(ctx, 'Preview Owner', 'preview-owner@example.com');
  const profileResponse = await owner.client.post('/api/me/founder-profile').send({ profile: {
    displayName: 'Public Preview Founder', publicProfile: true
  } });
  assert.equal(profileResponse.status, 201, JSON.stringify(profileResponse.body));
  const logo = await uploadImage(owner.client, 'brand-logo');
  const carousel = await uploadImage(owner.client, 'launch-carousel');
  const privateMedia = await uploadImage(owner.client, 'founder-avatar');
  const brand = await makePublishedBrand(owner, 'Preview Public Brand', logo.url);
  const launch = await makeLaunch(owner, brand, profileResponse.body.item.id, carousel.url, 'Preview Public Launch');
  assert.ok(owner.sessionCookie, 'fixture account has a session cookie to test that preview ignores it');

  const demoConfig = loadConfig({ ...ctx.config, previewReadOnly: true });
  const demoApp = createApp({ db: ctx.db, config: demoConfig, sendEmail: async () => { throw new Error('Preview requests must not send email.'); } });
  const tables = ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
  const rowCounts = () => Object.fromEntries(tables.map(name => [name, ctx.db.prepare(`SELECT COUNT(*) AS n FROM \"${name}\"`).get().n]));
  const before = rowCounts();
  const expectDemoReadOnly = response => {
    assert.equal(response.status, 403, JSON.stringify(response.body));
    assert.equal(response.body.error.code, 'DEMO_READ_ONLY');
    assert.match(response.body.error.message, /preview|demo/i);
    assert.equal(response.headers['set-cookie'], undefined);
  };

  for (const url of [
    '/api/health', '/api/categories', '/api/launches', `/api/launches/${launch.id}`,
    '/api/categories/popular?limit=3', '/api/businesses/leaderboard?period=monthly',
    '/api/founders?query=Preview', `/api/brands/${brand.slug}`, `/api/founders/${profileResponse.body.item.id}`,
    '/api/leaderboard', `/api/media/${logo.id}`, `/api/media/${carousel.id}`
  ]) {
    const response = await request(demoApp).get(url);
    assert.equal(response.status, 200, `${url}: ${JSON.stringify(response.body)}`);
    assert.equal(response.headers['set-cookie'], undefined, `${url} must not set a cookie`);
  }

  const cookieBearingDetail = await request(demoApp).get(`/api/launches/${launch.id}`).set('Cookie', owner.sessionCookie);
  assert.equal(cookieBearingDetail.status, 200);
  assert.equal(cookieBearingDetail.body.item.viewerState, undefined, 'a session cookie cannot personalize preview responses');
  assert.equal(cookieBearingDetail.headers['set-cookie'], undefined);

  for (const url of [
    '/api/me', '/api/me/saved', '/api/me/analytics?range=7d', '/api/me/founder-profile',
    '/api/me/brands', '/api/admin/reports', '/api/admin/leaderboard/holds', '/api/auth/verify-email'
  ]) {
    expectDemoReadOnly(await request(demoApp).get(url).set('Cookie', owner.sessionCookie));
  }
  expectDemoReadOnly(await request(demoApp).get(`/api/media/${privateMedia.id}`).set('Cookie', owner.sessionCookie));

  const blockedWrites = [
    request(demoApp).post('/api/auth/login').send({ email: 'preview-owner@example.com', password: 'not-used' }),
    request(demoApp).post(`/api/launches/${launch.id}/share`).send({}),
    request(demoApp).put(`/api/launches/${launch.id}/like`).send({}),
    request(demoApp).patch('/api/me/founder-profile').send({ profile: { displayName: 'Not applied' } }),
    request(demoApp).delete(`/api/launches/${launch.id}/save`).send({}),
    request(demoApp).post('/api/reports').send({})
  ];
  for (const write of blockedWrites) expectDemoReadOnly(await write);
  expectDemoReadOnly(await request(demoApp).get(`/api/launches/${launch.id}/outbound/website`).redirects(0));
  const headResponse = await request(demoApp).head('/api/categories');
  assert.equal(headResponse.status, 403, 'HEAD is not part of the preview GET allowlist');
  assert.equal(headResponse.headers['set-cookie'], undefined);
  expectDemoReadOnly(await request(demoApp).options('/api/categories'));

  assert.deepEqual(rowCounts(), before, 'public preview reads and denied requests must not insert or update any table rows');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM engagement_events').get().n, before.engagement_events);
});

test('preview read-only defaults on and can only be disabled for isolated in-memory API tests', () => {
  assert.equal(loadConfig({ nodeEnv: 'development', databasePath: ':memory:' }).previewReadOnly, true);
  assert.equal(loadConfig({ nodeEnv: 'test', databasePath: ':memory:', previewReadOnly: false }).previewReadOnly, false);
  assert.throws(() => loadConfig({ nodeEnv: 'development', databasePath: ':memory:', previewReadOnly: false }), /isolated API tests/);
  assert.throws(() => loadConfig({ nodeEnv: 'test', databasePath: '/tmp/not-an-isolated-test.sqlite', previewReadOnly: false }), /isolated API tests/);
  assert.throws(() => createApp({ db: {}, config: { nodeEnv: 'development', databasePath: ':memory:', previewReadOnly: false }, sendEmail: async () => {} }), /isolated API tests/);
});

test('synthetic interactive API requires a private proxy key and refuses protected storage paths', async t => {
  const ctx = await makeContext(t, {
    previewReadOnly: false, syntheticTestPreview: true, testPreviewAccessKey: 'synthetic-test-proxy-key-with-32-bytes',
    smtpHost: '', uploadDir: path.join(os.tmpdir(), `safe-preview-uploads-${process.pid}`),
    mailDir: path.join(os.tmpdir(), `safe-preview-mail-${process.pid}`)
  });
  const protectedApp = createApp({
    db: ctx.db, config: ctx.config, sendEmail: async message => ctx.messages.push(message),
    testPreviewOutbox: [{ to: 'test@synthetic.example.invalid', subject: 'Synthetic verify', text: 'https://example.invalid/verify?token=synthetic-test-token', createdAt: new Date().toISOString() }]
  });
  const denied = await request(protectedApp).get('/api/health');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'TEST_PREVIEW_PROXY_ONLY');
  const key = 'synthetic-test-proxy-key-with-32-bytes';
  assert.equal((await request(protectedApp).get('/api/health').set('x-test-preview-key', key)).status, 200);
  const outbox = await request(protectedApp).get('/api/__test/outbox').set('x-test-preview-key', key);
  assert.equal(outbox.status, 200);
  assert.equal(outbox.body.messages[0].to, 'test@synthetic.example.invalid');
  assert.equal(new URL(outbox.body.messages[0].verificationUrl).searchParams.get('token'), 'synthetic-test-token');
  assert.equal(outbox.headers['cache-control'], 'no-store');

  assert.throws(() => createApp({ db: ctx.db, config: {
    ...ctx.config, uploadDir: '/workspace/backend/storage/test-preview', syntheticTestPreview: true,
    testPreviewAccessKey: key, smtpHost: ''
  }, sendEmail: async () => {} }), /temporary storage/);
  assert.throws(() => createApp({ db: ctx.db, config: {
    ...ctx.config, mailDir: '/workspace/backend/.local-mail', syntheticTestPreview: true,
    testPreviewAccessKey: key, smtpHost: ''
  }, sendEmail: async () => {} }), /temporary storage/);
  assert.equal(loadConfig({ nodeEnv: 'development', databasePath: ':memory:' }).previewReadOnly, true);
});

test('production configuration requires HTTPS origins, distinct secrets, and SMTP', () => {
  const valid = {
    nodeEnv: 'production', sessionSecret: 'session-secret-for-production-0123456789',
    analyticsSalt: 'analytics-salt-for-production-9876543210', smtpHost: 'smtp.example.com',
    webOrigin: 'https://web.example.com', apiOrigin: 'https://api.example.com',
    databasePath: '/srv/aarambh/data/app.sqlite', uploadDir: '/srv/aarambh/uploads'
  };
  assert.equal(loadConfig(valid).webOrigin, 'https://web.example.com');
  assert.throws(() => loadConfig({ ...valid, webOrigin: 'http://web.example.com' }), /HTTPS in production/);
  assert.throws(() => loadConfig({ ...valid, analyticsSalt: valid.sessionSecret }), /must be different/);
  assert.throws(() => loadConfig({ ...valid, smtpHost: '' }), /SMTP_HOST is required/);
});

test('local email previews are written privately for the development verification flow', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'launch-mail-'));
  const mailDir = path.join(root, 'mail');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sendEmail = createEmailSender({ smtpHost: '', mailDir });
  await sendEmail({ to: 'founder@example.com', subject: 'Verify', text: 'one-time verification link' });
  const files = await fs.readdir(mailDir);
  assert.equal(files.length, 1);
  assert.equal((await fs.stat(mailDir)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(mailDir, files[0]))).mode & 0o777, 0o600);
  const message = JSON.parse(await fs.readFile(path.join(mailDir, files[0]), 'utf8'));
  assert.equal(message.previewOnly, true);
  assert.equal(message.text, 'one-time verification link');
});


test('products use owner-managed database catalogs, are publicly visible with safe HTTPS links, and pass isolated in-memory tests', async t => {
  const key = 'isolated-test-preview-key-with-at-least-32-bytes';
  const ctx = await makeContext(t, {
    previewReadOnly: false, syntheticTestPreview: true, testPreviewAccessKey: key, smtpHost: ''
  });
  const app = createApp({ db: ctx.db, config: ctx.config, sendEmail: async message => ctx.messages.push(message) });
  ctx.app = app;
  const proxy = { 'x-test-preview-key': key };
  const owner = await verifiedUser(ctx, 'Product Sample Owner', 'product-owner@synthetic.example.invalid', 'product-preview-test-password', proxy);
  const member = await verifiedUser(ctx, 'Product Sample Member', 'product-member@synthetic.example.invalid', 'product-preview-test-password', proxy);
  const profile = await owner.client.post('/api/me/founder-profile').send({ profile: { displayName: 'Product Sample Owner', publicProfile: true } });
  assert.equal(profile.status, 201, JSON.stringify(profile.body));
  const logo = await uploadImage(owner.client, 'brand-logo');
  const productImage = await uploadImage(owner.client, 'product-image');
  const brand = await makePublishedBrand(owner, 'Synthetic Product Brand', logo.url);

  const acceptedUpload = await owner.client.post('/api/uploads').field('purpose', 'product-image')
    .attach('file', await sharp({ create: { width: 12, height: 12, channels: 3, background: '#336699' } }).png().toBuffer(), { filename: 'outside-preview.png', contentType: 'image/png' });
  assert.equal(acceptedUpload.status, 201, 'product-image uploads are available only on this guarded synthetic preview app');

  const created = await owner.client.post(`/api/me/brands/${brand.id}/products`).send({ product: {
    name: 'Fictional Sample Notebook', description: 'A short fictional description for API verification.',
    imageUrl: productImage.url, buyUrl: 'https://synthetic-product-brand.invalid/products/notebook'
  } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.item.priceInrPaise, undefined, 'price is optional');
  assert.equal(created.body.item.buyUrl, 'https://synthetic-product-brand.invalid/products/notebook');
  assert.equal((await owner.client.get(`/api/me/brands/${brand.id}/products`)).body.items.length, 1);
  const patched = await owner.client.patch(`/api/me/brands/${brand.id}/products/${created.body.item.id}`).send({ product: {
    name: 'Updated Fictional Notebook', description: 'An edited catalog listing for API verification.', priceInrPaise: 149900
  } });
  assert.equal(patched.status, 200, JSON.stringify(patched.body));
  assert.equal(patched.body.item.name, 'Updated Fictional Notebook');
  assert.equal(patched.body.item.priceInrPaise, 149900);

  const badHttp = await owner.client.post(`/api/me/brands/${brand.id}/products`).send({ product: {
    name: 'Bad link sample', description: 'This one should not be accepted.', buyUrl: 'http://synthetic-product-brand.invalid/item'
  } });
  assert.equal(badHttp.status, 422);
  const badCredentials = await owner.client.post(`/api/me/brands/${brand.id}/products`).send({ product: {
    name: 'Bad credential link', description: 'Embedded credentials are rejected.', buyUrl: 'https://person:secret@synthetic-product-brand.invalid/item'
  } });
  assert.equal(badCredentials.status, 422);

  assert.equal((await member.client.get(`/api/me/brands/${brand.id}/products`)).status, 404, 'non-owners cannot read owner product management');
  assert.equal((await member.client.post(`/api/me/brands/${brand.id}/products`).send({ product: {
    name: 'Unauthorized sample', description: 'This must not be stored.', buyUrl: 'https://synthetic-product-brand.invalid/unauthorized'
  } })).status, 404, 'non-owners cannot create products for another brand');
  const publicBrand = await request(app).get(`/api/brands/${brand.slug}`).set(proxy);
  assert.equal(publicBrand.status, 200, JSON.stringify(publicBrand.body));
  assert.equal(publicBrand.body.item.products.length, 1);
  assert.equal(publicBrand.body.item.products[0].name, 'Updated Fictional Notebook');
  const priceMatch = await member.client.get('/api/discover/businesses?priceMin=140000&priceMax=160000');
  assert.equal(priceMatch.body.items.some(item => item.id === brand.id), true, 'business price filtering is based on its published catalog');
  const click = await member.client.post(`/api/businesses/${brand.id}/events`).send({ eventType: 'product_click', productId: created.body.item.id, source: 'search' });
  assert.equal(click.status, 202, JSON.stringify(click.body));
  const ownerDashboard = await owner.client.get('/api/me/dashboard?range=7d');
  assert.equal(ownerDashboard.body.bestProduct.name, 'Updated Fictional Notebook');
  assert.equal(ownerDashboard.body.bestProduct.clicks, 1);
  const publicImage = await request(app).get(`/api/media/${productImage.id}`).set(proxy);
  assert.equal(publicImage.status, 200, 'a published product image is public only after the product references it');

  const productTable = ctx.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products'").get();
  assert.equal(productTable?.name, 'products', 'the additive product migration is present in the in-memory test database');
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM products WHERE brand_id = ?').get(brand.id).n, 1);
  assert.equal((await member.client.patch(`/api/me/brands/${brand.id}/products/${created.body.item.id}`).send({ product: { name: 'Unauthorized edit' } })).status, 404);
  assert.equal((await owner.client.delete(`/api/me/brands/${brand.id}/products/${created.body.item.id}`)).status, 204);
  assert.equal((await request(app).get(`/api/brands/${brand.slug}`).set(proxy)).body.item.products.length, 0);
  assert.equal((await request(app).get(`/api/media/${productImage.id}`).set(proxy)).status, 404, 'an image is no longer public after the catalog item is removed');
  assert.equal((await request(app).get('/api/me/brands/not-a-brand/products')).status, 403, 'the API key still protects the isolated API');
});


test('product-image uploads are available to authorized catalog owners in isolated database-backed API mode', async t => {
  const ctx = await makeContext(t, { previewReadOnly: false });
  const owner = await verifiedUser(ctx, 'Ordinary API Owner', 'ordinary-owner@synthetic.example.invalid');
  const response = await owner.client.post('/api/uploads').field('purpose', 'product-image')
    .attach('file', await sharp({ create: { width: 12, height: 12, channels: 3, background: '#336699' } }).png().toBuffer(), { filename: 'ordinary-product.png', contentType: 'image/png' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(ctx.db.prepare('SELECT purpose FROM media_assets WHERE id = ?').get(response.body.asset.id).purpose, 'launch-carousel');
});

test('founder pronouns/interests and business cover/gallery persist through profile APIs', async t => {
  const ctx = await makeContext(t, { previewReadOnly: false });
  const owner = await verifiedUser(ctx, 'Synthetic Profile Owner', 'profile-fields@example.com');

  const profileCreated = await owner.client.post('/api/me/founder-profile').send({ profile: {
    displayName: 'Synthetic Profile Owner', publicProfile: true, pronouns: ' she/her ',
    interests: 'Ceramics, slow design, textiles', verified: true, verificationStatus: 'verified'
  } });
  assert.equal(profileCreated.status, 201, JSON.stringify(profileCreated.body));
  const profileId = profileCreated.body.item.id;
  assert.equal(profileCreated.body.item.pronouns, 'she/her');
  assert.deepEqual(profileCreated.body.item.interests, ['Ceramics', 'slow design', 'textiles']);
  assert.equal(profileCreated.body.item.verified, undefined, 'verification is not profile-controlled');
  const storedProfile = ctx.db.prepare('SELECT pronouns, interests_json FROM founder_profiles WHERE id = ?').get(profileId);
  assert.equal(storedProfile.pronouns, 'she/her');
  assert.deepEqual(JSON.parse(storedProfile.interests_json), ['Ceramics', 'slow design', 'textiles']);

  const profilePatch = await owner.client.patch('/api/me/founder-profile').send({ profile: {
    pronouns: 'they/them', interests: ['Community building', 'Design']
  } });
  assert.equal(profilePatch.status, 200, JSON.stringify(profilePatch.body));
  assert.equal(profilePatch.body.item.pronouns, 'they/them');
  assert.deepEqual(profilePatch.body.item.interests, ['Community building', 'Design']);
  const publicFounder = await request(ctx.app).get(`/api/founders/${profileId}`);
  assert.equal(publicFounder.status, 200);
  assert.equal(publicFounder.body.item.pronouns, 'they/them');
  assert.deepEqual(publicFounder.body.item.interests, ['Community building', 'Design']);
  assert.equal(publicFounder.body.item.verified, undefined);
  const invalidInterests = await owner.client.patch('/api/me/founder-profile').send({ profile: { interests: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] } });
  assert.equal(invalidInterests.status, 422);
  const clearFounderDetails = await owner.client.patch('/api/me/founder-profile').send({ profile: { pronouns: null, interests: [] } });
  assert.equal(clearFounderDetails.status, 200, JSON.stringify(clearFounderDetails.body));
  assert.equal(clearFounderDetails.body.item.pronouns, undefined);
  assert.deepEqual(clearFounderDetails.body.item.interests, []);

  const brandCreated = await owner.client.post('/api/me/brands').send({ brand: {
    name: 'Synthetic Gallery Studio', description: 'A fictional business for profile API tests.', category: 'arts-crafts',
    websiteUrl: 'https://gallery.example.invalid', coverImageUrl: 'https://images.example.invalid/cover.webp',
    galleryImageUrls: ['https://images.example.invalid/gallery-one.webp', '/images/gallery-two.jpg']
  } });
  assert.equal(brandCreated.status, 201, JSON.stringify(brandCreated.body));
  const brandId = brandCreated.body.item.id;
  const brandSlug = brandCreated.body.item.slug;
  assert.equal(brandCreated.body.item.coverImageUrl, 'https://images.example.invalid/cover.webp');
  assert.deepEqual(brandCreated.body.item.galleryImageUrls, ['https://images.example.invalid/gallery-one.webp', '/images/gallery-two.jpg']);
  const storedBrand = ctx.db.prepare('SELECT cover_image_url, gallery_image_urls FROM brands WHERE id = ?').get(brandId);
  assert.equal(storedBrand.cover_image_url, 'https://images.example.invalid/cover.webp');
  assert.deepEqual(JSON.parse(storedBrand.gallery_image_urls), ['https://images.example.invalid/gallery-one.webp', '/images/gallery-two.jpg']);

  const brandPatch = await owner.client.patch(`/api/me/brands/${brandId}`).send({ brand: {
    galleryImageUrls: 'https://images.example.invalid/gallery-three.webp\n/images/gallery-four.png'
  } });
  assert.equal(brandPatch.status, 200, JSON.stringify(brandPatch.body));
  assert.deepEqual(brandPatch.body.item.galleryImageUrls, ['https://images.example.invalid/gallery-three.webp', '/images/gallery-four.png']);
  const partialBrandPatch = await owner.client.patch(`/api/me/brands/${brandId}`).send({ brand: { tagline: 'Synthetic test tagline' } });
  assert.equal(partialBrandPatch.status, 200);
  assert.equal(partialBrandPatch.body.item.coverImageUrl, 'https://images.example.invalid/cover.webp');
  assert.deepEqual(partialBrandPatch.body.item.galleryImageUrls, ['https://images.example.invalid/gallery-three.webp', '/images/gallery-four.png']);

  const invalidCover = await owner.client.patch(`/api/me/brands/${brandId}`).send({ brand: { coverImageUrl: 'http://images.example.invalid/not-https.webp' } });
  assert.equal(invalidCover.status, 422);
  const tooManyGalleryImages = await owner.client.patch(`/api/me/brands/${brandId}`).send({ brand: {
    galleryImageUrls: Array.from({ length: 7 }, (_, index) => `https://images.example.invalid/${index}.webp`)
  } });
  assert.equal(tooManyGalleryImages.status, 422);

  const clearMedia = await owner.client.patch(`/api/me/brands/${brandId}`).send({ brand: { coverImageUrl: '', galleryImageUrls: [] } });
  assert.equal(clearMedia.status, 200, JSON.stringify(clearMedia.body));
  assert.equal(clearMedia.body.item.coverImageUrl, undefined);
  assert.deepEqual(clearMedia.body.item.galleryImageUrls, []);

  const restoreMedia = await owner.client.patch(`/api/me/brands/${brandId}`).send({ brand: {
    coverImageUrl: 'https://images.example.invalid/cover.webp',
    galleryImageUrls: ['https://images.example.invalid/gallery-three.webp', '/images/gallery-four.png']
  } });
  assert.equal(restoreMedia.status, 200, JSON.stringify(restoreMedia.body));
  ctx.db.prepare("UPDATE brands SET status = 'published' WHERE id = ?").run(brandId);
  const publicBrand = await request(ctx.app).get(`/api/brands/${brandSlug}`);
  assert.equal(publicBrand.status, 200, JSON.stringify(publicBrand.body));
  assert.equal(publicBrand.body.item.coverImageUrl, 'https://images.example.invalid/cover.webp');
  assert.deepEqual(publicBrand.body.item.galleryImageUrls, ['https://images.example.invalid/gallery-three.webp', '/images/gallery-four.png']);
});
