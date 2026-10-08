import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase } from '../db/index.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { seedSyntheticTestDatabase, SYNTHETIC_TEST_ACCOUNTS } from '../src/synthetic-test-seed.js';

test('each fresh synthetic preview seeds fictional discovery shelves in memory only', async t => {
  for (let restart = 0; restart < 2; restart += 1) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-preview-seed-regression-'));
    const db = openDatabase(':memory:');
    t.after(async () => { if (db.open) db.close(); await fs.rm(root, { recursive: true, force: true }); });
    const uploadDir = path.join(root, 'uploads');
    const seed = await seedSyntheticTestDatabase(db, { uploadDir, webOrigin: 'http://localhost:5173' });
    const config = loadConfig({
      nodeEnv: 'test', databasePath: ':memory:', uploadDir, mailDir: path.join(root, 'mail'),
      apiOrigin: 'http://localhost:4000', webOrigin: 'http://localhost:5173', cookieSecure: false,
      sessionSecret: `synthetic-seed-session-secret-${restart}-must-be-long-enough`,
      analyticsSalt: `synthetic-seed-analytics-salt-${restart}-must-be-long-enough`, previewReadOnly: false
    });
    const app = createApp({ db, config });
    assert.equal(db.name, ':memory:');
    assert.equal(seed.seededBusinessCount, 10);
    assert.equal(seed.seededLaunchCount, 17);
    assert.notEqual(seed.miraFounderProfileId, seed.profileId);
    const rheaLogin = await request(app).post('/api/auth/login').send({
      email: SYNTHETIC_TEST_ACCOUNTS.founder.email,
      password: SYNTHETIC_TEST_ACCOUNTS.founder.password
    });
    assert.equal(rheaLogin.status, 200, JSON.stringify(rheaLogin.body));
    const rheaSearch = await request(app).get('/api/founders?query=Rhea%20Sample');
    assert.equal(rheaSearch.status, 200, JSON.stringify(rheaSearch.body));
    assert.ok(rheaSearch.body.items.some(item => item.id === seed.profileId && item.slug === 'rhea-sample-test-founder'));
    const businesses = await request(app).get('/api/discover/businesses?limit=50');
    const launches = await request(app).get('/api/launches?limit=50');
    const categories = await request(app).get('/api/categories/popular?limit=50');
    const collections = await request(app).get('/api/collections/public?limit=50');
    const miraSearch = await request(app).get('/api/founders?query=Mira%20Shah&city=Ahmedabad');
    const miraProfile = await request(app).get('/api/founders/mira-shah-synthetic-founder');
    const miraBrand = await request(app).get('/api/brands/miti-studio');
    const miraLaunches = await Promise.all(seed.miraLaunchIds.map(id => request(app).get(`/api/launches/${id}`)));
    assert.equal(businesses.status, 200, JSON.stringify(businesses.body));
    assert.equal(launches.status, 200, JSON.stringify(launches.body));
    assert.equal(categories.status, 200, JSON.stringify(categories.body));
    assert.equal(collections.status, 200, JSON.stringify(collections.body));
    assert.equal(miraSearch.status, 200, JSON.stringify(miraSearch.body));
    assert.equal(miraProfile.status, 200, JSON.stringify(miraProfile.body));
    assert.equal(miraBrand.status, 200, JSON.stringify(miraBrand.body));
    for (const miraLaunch of miraLaunches) assert.equal(miraLaunch.status, 200, JSON.stringify(miraLaunch.body));
    assert.equal(miraSearch.body.items.length, 1);
    assert.deepEqual(miraSearch.body.items[0], {
      id: seed.miraFounderProfileId,
      slug: 'mira-shah-synthetic-founder',
      displayName: 'Mira Shah',
      bio: 'Mira designs with local artisans to create contemporary home pieces rooted in craft, function and story.',
      city: 'Ahmedabad',
      state: 'Gujarat',
      role: 'Founder',
      brandCount: 1
    });
    assert.equal(miraProfile.body.item.id, seed.miraFounderProfileId);
    assert.equal(miraProfile.body.item.displayName, 'Mira Shah');
    assert.equal(miraProfile.body.item.bio, 'Mira designs with local artisans to create contemporary home pieces rooted in craft, function and story.');
    assert.equal(miraProfile.body.item.city, 'Ahmedabad');
    assert.equal(miraProfile.body.item.state, 'Gujarat');
    assert.equal(miraProfile.body.item.role, 'Founder');
    assert.equal(miraProfile.body.item.followers, undefined, 'do not invent a verified follower count');
    assert.deepEqual(miraProfile.body.item.brands.map(brand => ({ id: brand.id, slug: brand.slug })), [
      { id: seed.miraBusinessId, slug: 'miti-studio' }
    ]);
    assert.equal(miraBrand.body.item.id, seed.miraBusinessId);
    assert.equal(miraBrand.body.item.slug, 'miti-studio');
    assert.equal(miraBrand.body.item.name, 'Miti Studio');
    assert.equal(miraBrand.body.item.city, 'Ahmedabad');
    assert.equal(miraBrand.body.item.state, 'Gujarat');
    assert.equal(miraBrand.body.item.followers, undefined, 'do not invent a verified follower count');
    assert.ok(miraBrand.body.item.founders.some(founder => founder.id === seed.miraFounderProfileId &&
      founder.slug === 'mira-shah-synthetic-founder' && founder.displayName === 'Mira Shah'));
    const miraLaunchSlugs = [
      'miti-handwoven-home-textiles', 'miti-woven-lighting', 'miti-artisan-tableware'
    ];
    assert.deepEqual(miraBrand.body.item.launches.map(launch => launch.slug), miraLaunchSlugs);
    assert.deepEqual(miraLaunches.map(response => response.body.item.slug).sort(), [...miraLaunchSlugs].sort());
    for (const response of miraLaunches) {
      assert.equal(response.body.item.brand.id, seed.miraBusinessId);
      assert.ok(response.body.item.founders.some(founder => founder.id === seed.miraFounderProfileId));
    }
    assert.ok(businesses.body.items.length >= 10, `restart ${restart + 1} should have synthetic business listings`);
    assert.ok(launches.body.items.length >= 17, `restart ${restart + 1} should have synthetic launches`);
    assert.ok(categories.body.categories.length > 0, `restart ${restart + 1} should have active popular categories`);
    assert.equal(collections.body.items.length, 3, `restart ${restart + 1} should seed both guides and Mira's public collection`);
    const guide = collections.body.items.find(item => item.name === 'Sample Local Launch Guide');
    const makersGuide = collections.body.items.find(item => item.name === 'Sample Makers & Ideas Guide');
    const miraCollection = collections.body.items.find(item => item.id === seed.miraCollectionId);
    assert.ok(guide, `restart ${restart + 1} should include the local launch guide`);
    assert.ok(makersGuide, `restart ${restart + 1} should include the makers and ideas guide`);
    assert.ok(miraCollection, `restart ${restart + 1} should include Mira's public community collection`);
    assert.equal(guide.name, 'Sample Local Launch Guide');
    assert.equal(guide.isPublic, true);
    assert.equal(guide.launchCount, 4);
    assert.deepEqual(guide.launches.map(launch => launch.slug), [
      'sample-cafe-opening', 'sample-loomworks-drop', 'sample-neighbourhood-session', 'sample-threadline-drop'
    ]);
    assert.equal(makersGuide.isPublic, true);
    assert.equal(makersGuide.launchCount, 4);
    assert.deepEqual(makersGuide.launches.map(launch => launch.slug), [
      'sample-release-notes', 'sample-neighborhood-map', 'sample-studio-toolkit', 'sample-garden-kit'
    ]);
    assert.equal(miraCollection.name, 'Miti Studio Community Picks');
    assert.equal(miraCollection.isPublic, true);
    assert.equal(miraCollection.launchCount, 3);
    assert.deepEqual(miraCollection.launches.map(launch => launch.slug), miraLaunchSlugs);
    assert.ok(miraCollection.launches.every(launch => launch.founders.some(founder => founder.id === seed.miraFounderProfileId)));
    assert.match(miraCollection.shareUrl, /^\/test\/collection\/[0-9a-f-]+$/i);
    const shareToken = miraCollection.shareUrl.split('/').at(-1);
    const sharedMiraCollection = await request(app).get(`/api/collections/share/${shareToken}`);
    assert.equal(sharedMiraCollection.status, 200, JSON.stringify(sharedMiraCollection.body));
    assert.equal(sharedMiraCollection.body.item.id, seed.miraCollectionId);
    assert.equal(sharedMiraCollection.body.item.launchCount, 3);
    assert.deepEqual(sharedMiraCollection.body.item.launches.map(launch => launch.slug), miraLaunchSlugs);
  }
});
