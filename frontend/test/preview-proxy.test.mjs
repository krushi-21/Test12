import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { after, before, test } from 'node:test'
import { createSyntheticPreviewProxyGuard } from '../test-preview-proxy.mjs'

const expectedOrigin = 'https://preview.example.test'
let server
let localOrigin

async function startServer(guard) {
  const instance = createServer((req, res) => guard(req, res, () => {
    if (req.url?.startsWith('/api')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'api-ok' }))
      return
    }
    if (req.url?.startsWith('/test')) {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<main id="interactive-test-app">Public synthetic preview</main>')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<main id="static-demo">Read-only static demo</main>')
  }))
  await new Promise((resolve, reject) => instance.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
  return { server: instance, origin: `http://127.0.0.1:${instance.address().port}` }
}

before(async () => {
  const running = await startServer(createSyntheticPreviewProxyGuard({ origin: expectedOrigin }))
  server = running.server
  localOrigin = running.origin
})

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})

test('anonymous visitors can open /test, browse the same-origin API, and still use the unchanged static root', async () => {
  const root = await fetch(`${localOrigin}/`)
  assert.equal(root.status, 200)
  assert.match(await root.text(), /static-demo/u)

  const page = await fetch(`${localOrigin}/test`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /interactive-test-app/u)
  assert.equal(page.headers.get('cache-control'), null)

  const linkedFromElsewhere = await fetch(`${localOrigin}/test`, { headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(linkedFromElsewhere.status, 200, 'an ordinary external link must be able to open the shared preview URL')

  const publicApi = await fetch(`${localOrigin}/api/health`)
  assert.equal(publicApi.status, 200, 'anonymous same-origin proxy reads must not need an outer session')
  assert.deepEqual(await publicApi.json(), { status: 'api-ok' })

  for (const route of ['/test/login', '/test/logout']) {
    assert.equal((await fetch(`${localOrigin}${route}`)).status, 404, `${route} should not remain as a retired credential endpoint`)
  }
})

test('the proxy rejects cross-origin API traffic and unsafe requests without exact same-origin evidence', async () => {
  const hostileGet = await fetch(`${localOrigin}/api/health`, {
    headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }
  })
  assert.equal(hostileGet.status, 403)
  assert.equal((await hostileGet.json()).error.code, 'TEST_PREVIEW_ORIGIN_DENIED')

  const siblingGet = await fetch(`${localOrigin}/api/health`, { headers: { 'sec-fetch-site': 'same-site' } })
  assert.equal(siblingGet.status, 403, 'a sibling origin is not the same-origin API proxy')

  const missingOrigin = await fetch(`${localOrigin}/api/write`, { method: 'POST' })
  assert.equal(missingOrigin.status, 403)

  const hostilePost = await fetch(`${localOrigin}/api/write`, {
    method: 'POST', headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }
  })
  assert.equal(hostilePost.status, 403)

  const sameOriginPost = await fetch(`${localOrigin}/api/write`, {
    method: 'POST', headers: { origin: expectedOrigin, 'sec-fetch-site': 'same-origin' }
  })
  assert.equal(sameOriginPost.status, 200, 'same-origin writes reach the backend, where app-level auth remains authoritative')

  const unsupportedMethodStatus = await new Promise((resolve, reject) => {
    const unsupportedMethod = httpRequest(`${localOrigin}/api/write`, { method: 'TRACE' }, response => {
      response.resume()
      resolve(response.statusCode)
    })
    unsupportedMethod.on('error', reject)
    unsupportedMethod.end()
  })
  assert.equal(unsupportedMethodStatus, 405)
})

test('anonymous proxy traffic receives bounded per-peer rate limits', async () => {
  let clock = 1_800_000_000_000
  const limited = await startServer(createSyntheticPreviewProxyGuard({
    origin: expectedOrigin, now: () => clock, windowMs: 2_000, maxRequests: 2, maxMutatingRequests: 1
  }))
  try {
    assert.equal((await fetch(`${limited.origin}/api/health`)).status, 200)
    assert.equal((await fetch(`${limited.origin}/api/health`)).status, 200)
    const exceeded = await fetch(`${limited.origin}/api/health`)
    assert.equal(exceeded.status, 429)
    assert.equal((await exceeded.json()).error.code, 'TEST_PREVIEW_RATE_LIMITED')
    assert.ok(Number(exceeded.headers.get('retry-after')) >= 1)
    clock += 2_001
    assert.equal((await fetch(`${limited.origin}/api/health`)).status, 200)
  } finally {
    await new Promise((resolve, reject) => limited.server.close(error => error ? reject(error) : resolve()))
  }
})

test('proxy origin and limits must be valid and positive', () => {
  assert.throws(() => createSyntheticPreviewProxyGuard({ origin: 'https://preview.example.test/path' }), /exact HTTP\(S\) origin/u)
  assert.throws(() => createSyntheticPreviewProxyGuard({ origin: expectedOrigin, maxRequests: 0 }), /positive integers/u)
})
