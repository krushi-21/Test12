import assert from 'node:assert/strict';

const siteUrl = process.env.TEST_PREVIEW_URL ?? 'http://localhost:4173/test';
const origin = new URL(siteUrl).origin;

const publicPage = await fetch(`${origin}/test`);
assert.equal(publicPage.status, 200, 'anyone with the test URL should be able to open /test');
const pageHtml = await publicPage.text();
assert.doesNotMatch(pageHtml, /test-preview-login|name="username"|name="password"/u, 'the retired outer login must not be rendered');
assert.equal((await fetch(`${origin}/api/health`)).status, 200, 'anonymous public browsing through the same-origin proxy should work');
assert.equal((await fetch(`${origin}/`)).status, 200, 'the unchanged static demo remains available at /');
assert.equal((await fetch(`${origin}/test/login`)).status, 404, 'the retired outer credential route must not remain');

const crossOriginRead = await fetch(`${origin}/api/health`, {
  headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }
});
assert.equal(crossOriginRead.status, 403, 'cross-origin API reads should be rejected by the proxy guard');
const missingOriginWrite = await fetch(`${origin}/api/launches/sample-release-notes/like`, { method: 'PUT' });
assert.equal(missingOriginWrite.status, 403, 'state-changing proxy requests require same-origin evidence');
const unauthorizedLike = await fetch(`${origin}/api/launches/sample-release-notes/like`, {
  method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: '{}'
});
assert.equal(unauthorizedLike.status, 401, 'the backend must continue requiring an app account for likes');
assert.equal((await unauthorizedLike.json()).error.code, 'AUTH_REQUIRED');
const unauthorizedProductEdit = await fetch(`${origin}/api/me/brands/not-an-owned-brand/products`, {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ product: { name: 'Synthetic' } })
});
assert.equal(unauthorizedProductEdit.status, 401, 'the backend must continue requiring an app account for product edits');

async function request(path, { method = 'GET', body, form, cookie, allowFailure = false } = {}) {
  const headers = { origin };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${origin}${path}`, {
    method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: 'manual'
  });
  const sessionCookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!allowFailure) assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return { response, payload, sessionCookie };
}

assert.equal((await request('/api/health')).payload.status, 'ok');
const categories = await request('/api/categories');
assert.ok(categories.payload.categories.length >= 10);
const feed = await request('/api/launches?limit=20');
assert.ok(feed.payload.items.length >= 5);
assert.equal((await request('/api/leaderboard?period=weekly')).payload.forming, false);
const seededLaunch = feed.payload.items.find(item => item.slug === 'sample-release-notes');
assert.ok(seededLaunch, 'the seeded synthetic sample launch should be browseable');
const seededBrand = (await request(`/api/brands/${seededLaunch.brand.slug}`)).payload.item;
assert.equal(seededBrand.name, 'Sample Orbit Labs');
assert.ok(seededBrand.products.some(product => new URL(product.buyUrl).hostname.endsWith('.invalid')), 'seeded product links must use the reserved .invalid domain');

const memberLogin = await request('/api/auth/login', { method: 'POST', body: {
  email: 'member@synthetic.example.invalid', password: 'TestMember_2026!'
} });
const memberCookie = memberLogin.sessionCookie;
assert.ok(memberCookie, 'member sign-in should set an HttpOnly session cookie');
await request(`/api/launches/${seededLaunch.slug}/like`, { method: 'DELETE', cookie: memberCookie });
await request(`/api/launches/${seededLaunch.slug}/save`, { method: 'DELETE', cookie: memberCookie });
assert.equal((await request(`/api/launches/${seededLaunch.slug}`, { cookie: memberCookie })).payload.item.viewerState.liked, false);
const likeAction = await request(`/api/launches/${seededLaunch.slug}/like`, { method: 'PUT', body: {}, cookie: memberCookie });
assert.equal(likeAction.payload.liked, true, 'the verified member should be able to like another founder launch');
assert.ok(Number.isInteger(likeAction.payload.likeCount) && likeAction.payload.likeCount >= 1, 'the count should include the new like without assuming an empty seed');
assert.equal((await request(`/api/launches/${seededLaunch.slug}/save`, { method: 'PUT', body: {}, cookie: memberCookie })).payload.saved, true);
assert.equal((await request(`/api/launches/${seededLaunch.slug}/share`, { method: 'POST', body: {}, cookie: memberCookie })).response.status, 202);
assert.ok((await request('/api/me/saved', { cookie: memberCookie })).payload.items.some(item => item.slug === seededLaunch.slug || item.id === seededLaunch.id), 'the saved list should include the launch just saved');
assert.equal((await request(`/api/launches/${seededLaunch.slug}`, { cookie: memberCookie })).payload.item.viewerState.saved, true);
await request('/api/auth/logout', { method: 'POST', body: {}, cookie: memberCookie });
assert.equal((await request('/api/me', { cookie: memberCookie, allowFailure: true })).response.status, 401);

const founderLogin = await request('/api/auth/login', { method: 'POST', body: {
  email: 'founder@synthetic.example.invalid', password: 'TestFounder_2026!'
} });
const founderCookie = founderLogin.sessionCookie;
const founderProfile = (await request('/api/me/founder-profile', { cookie: founderCookie })).payload.item;
assert.ok(founderProfile?.id);
async function upload(purpose, fixturePath) {
  const fixture = await fetch(`${origin}${fixturePath}`);
  assert.ok(fixture.ok, `${fixturePath} should load from the local preview`);
  const blob = await fixture.blob();
  const form = new FormData();
  form.set('purpose', purpose);
  form.set('file', new File([blob], purpose === 'brand-logo' ? 'sample-logo.webp' : purpose === 'product-image' ? 'sample-product.webp' : 'sample-launch.jpg', { type: blob.type }));
  return (await request('/api/uploads', { method: 'POST', form, cookie: founderCookie })).payload.asset;
}

const stamp = Date.now();
const logo = await upload('brand-logo', '/images/launch-craft.webp');
const brandName = `E2E Synthetic Brand ${stamp}`;
const brand = (await request('/api/me/brands', { method: 'POST', cookie: founderCookie, body: { brand: {
  name: brandName, logoUrl: logo.url,
  description: 'A fictional brand created only to test the isolated local preview.',
  category: 'technology-software', websiteUrl: 'https://e2e-sample.invalid'
} } })).payload.item;
assert.equal(brand.status, 'draft');
assert.equal((await request(`/api/me/brands/${brand.id}/publish`, { method: 'POST', body: {}, cookie: founderCookie })).payload.item.status, 'published');

const productImage = await upload('product-image', '/images/launch-craft.webp');
const product = (await request(`/api/me/brands/${brand.id}/products`, { method: 'POST', cookie: founderCookie, body: { product: {
  name: `E2E Synthetic Product ${stamp}`, description: 'A fictional sample product created by the isolated API smoke.',
  imageUrl: productImage.url, buyUrl: 'https://e2e-sample.invalid/products/sample'
} } })).payload.item;
assert.equal(product.priceInrPaise, undefined, 'product pricing is optional');
assert.equal(product.buyUrl, 'https://e2e-sample.invalid/products/sample');
const badProductUrl = await request(`/api/me/brands/${brand.id}/products`, { method: 'POST', cookie: founderCookie, body: { product: {
  name: 'Rejected URL sample', description: 'Non-HTTPS links are not accepted.', buyUrl: 'http://e2e-sample.invalid/products/sample'
} }, allowFailure: true });
assert.equal(badProductUrl.response.status, 422);
const publicProductBrand = (await request(`/api/brands/${brand.slug}`)).payload.item;
assert.equal(publicProductBrand.products[0].id, product.id);
assert.equal((await request(productImage.url.replace(origin, ''), { cookie: undefined })).response.status, 200);

const image = await upload('launch-carousel', '/images/launch-home.jpg');
const launchTitle = `E2E Synthetic Launch ${stamp}`;
const launch = (await request(`/api/me/brands/${brand.id}/launches`, { method: 'POST', cookie: founderCookie, body: {
  status: 'draft', launch: {
    title: launchTitle, launchType: 'product', category: 'technology-software',
    summary: 'Fictional launch text for an end-to-end test.',
    story: 'Synthetic content held only in the disposable in-memory test database.',
    images: [{ url: image.url, altText: 'Synthetic sample image for an isolated test launch' }],
    founderIds: [founderProfile.id], brandId: brand.id
  }
} })).payload.item;
assert.equal(launch.status, 'draft');
assert.equal((await request(`/api/me/launches/${launch.id}/publish`, { method: 'POST', body: {}, cookie: founderCookie })).payload.item.status, 'published');
assert.ok((await request(`/api/launches?query=${encodeURIComponent(launchTitle)}`)).payload.items.some(item => item.slug === launch.slug));
assert.equal((await request(`/api/brands/${brand.slug}`)).payload.item.launches[0].slug, launch.slug);
const publicMedia = await request(image.url.replace(origin, ''), { cookie: undefined });
assert.equal(publicMedia.response.status, 200, 'published synthetic media should be readable through the same-origin preview proxy');

const newEmail = `smoke-${stamp}@synthetic.example.invalid`;
await request('/api/auth/register', { method: 'POST', body: {
  displayName: 'Synthetic Smoke Account', email: newEmail, password: 'Synthetic_Smoke_Pass_2026!'
} });
let outbox = (await request('/api/__test/outbox')).payload.messages;
const verification = outbox.findLast(message => message.to === newEmail && message.verificationUrl?.includes('/verify-email'));
assert.ok(verification, 'registration should create a local synthetic verification message');
const verificationToken = new URL(verification.verificationUrl).searchParams.get('token');
const verified = await request('/api/auth/verify-email', { method: 'POST', body: { token: verificationToken } });
assert.ok(verified.sessionCookie);
assert.equal((await request('/api/me', { cookie: verified.sessionCookie })).payload.user.email, newEmail);
await request('/api/auth/password/forgot', { method: 'POST', body: { email: newEmail } });
outbox = (await request('/api/__test/outbox')).payload.messages;
const reset = outbox.findLast(message => message.to === newEmail && message.verificationUrl?.includes('/reset-password'));
assert.ok(reset, 'password reset should stay in the local synthetic outbox');
const resetToken = new URL(reset.verificationUrl).searchParams.get('token');
await request('/api/auth/password/reset', { method: 'POST', body: { token: resetToken, password: 'Synthetic_Reset_Pass_2026!' } });
assert.equal((await request('/api/me', { cookie: verified.sessionCookie, allowFailure: true })).response.status, 401);
assert.ok((await request('/api/auth/login', { method: 'POST', body: { email: newEmail, password: 'Synthetic_Reset_Pass_2026!' } })).sessionCookie);

console.log('PASS: anonymous /test and same-origin API browse/categories/detail/brand/leaderboard; root static demo remains available.');
console.log('PASS: cross-origin and origin-less state changes denied at the proxy; unauthenticated likes and product edits denied by app auth.');
console.log('PASS: account login/logout, HttpOnly sessions, likes, saves, shares, and saved list.');
console.log('PASS: founder profile, image upload, brand draft/publish, launch draft/publish, public media and browse visibility.');
console.log('PASS: synthetic registration, memory-only verification/reset outbox, reset-induced session revocation, and relogin.');
