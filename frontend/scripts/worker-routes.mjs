import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import worker from '../worker.js'

const root = fileURLToPath(new URL('..', import.meta.url))

export async function runWorkerRouteTests() {
  const workerSource = readFileSync(path.join(root, 'worker.js'), 'utf8')
  assert.doesNotMatch(workerSource, /\bAPI_ORIGIN\b|4000/i, 'Worker must not contain the removed API origin or port-4000 tunnel')
  assert.doesNotMatch(workerSource, /(^|[^\w.$])(?:globalThis\.)?fetch\s*\((?!request,\s*env)/m, 'Worker must not call global fetch or another upstream fetch function')
  assert.doesNotMatch(workerSource, /authorization|cookie|x-api-key/i, 'Worker must not inspect or forward credentials')
  assert.match(workerSource, /env\.ASSETS\.fetch\(request\)/, 'non-API requests should still reach local static assets')

  const originalFetch = globalThis.fetch
  let upstreamFetches = 0
  let assetFetches = 0
  const env = {
    ASSETS: {
      async fetch(request) {
        assetFetches += 1
        return new Response(`asset:${new URL(request.url).pathname}`, { status: 200 })
      },
    },
  }
  globalThis.fetch = async () => {
    upstreamFetches += 1
    throw new Error('Unexpected upstream fetch from Worker route test')
  }

  const apiPaths = [
    '/api', '/api/', '/api/health', '/api/categories',
    '/api/launches', '/api/launches?query=synthetic&category=home-living',
    '/api/launches/sample-launch', '/api/brands/sample-brand',
    '/api/founders/sample-founder', '/api/media/sample-image',
    '/api/leaderboard?period=weekly', '/api/me', '/api/me/brands',
    '/api/auth/login', '/api/reports', '/api/uploads', '/api/analytics',
    '/api/launches/sample/share', '/api/launches/sample/outbound/site',
    '/api/launches?token=synthetic-secret', '/api/categories?email=demo%40example.invalid',
    '/api/launches/sample/extra', '/api/not-a-route', '/api%2Fcategories',
    '/API/me',
  ]
  const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  const syntheticCredentials = {
    Cookie: 'session=synthetic-test-secret',
    Authorization: 'Bearer synthetic-test-secret',
    'X-API-Key': 'synthetic-test-secret',
  }

  try {
    for (const route of apiPaths) {
      for (const method of methods) {
        const request = new Request(`https://preview.local${route}`, { method, headers: syntheticCredentials })
        const response = await worker.fetch(request, env)
        assert.equal(response.status, 404, `${method} ${route} must return the local unavailable/404 response`)
        assert.equal(response.headers.get('cache-control'), 'no-store', `${method} ${route} must not cache the unavailable response`)
        assert.equal(response.headers.has('set-cookie'), false, `${method} ${route} must not set or forward cookies`)
        const body = await response.text()
        assert.match(body, /API_UNAVAILABLE/, `${method} ${route} must identify the API as locally unavailable`)
        assert.doesNotMatch(body, /synthetic-test-secret|demo@example\.invalid/i, `${method} ${route} must not echo credentials or query data`)
      }
    }

    assert.equal(assetFetches, 0, 'no /api route may fall through to the asset binding')
    assert.equal(upstreamFetches, 0, 'no /api route may call global fetch or contact an upstream')

    const assetResponse = await worker.fetch(new Request('https://preview.local/'), env)
    assert.equal(assetResponse.status, 200, 'non-API traffic should still serve the local UI asset binding')
    assert.equal(await assetResponse.text(), 'asset:/')
    assert.equal(assetFetches, 1, 'only the non-API asset request should reach the local asset binding')
    assert.equal(upstreamFetches, 0, 'serving the local UI must not call an upstream')

    return {
      apiPaths: apiPaths.length,
      methods: methods.length,
      blockedCases: apiPaths.length * methods.length,
      upstreamFetches,
      apiAssetFetches: 0,
      localAssetRequests: assetFetches,
      credentialsEchoed: false,
      port4000Traffic: 0,
    }
  } finally {
    globalThis.fetch = originalFetch
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runWorkerRouteTests()
    console.log(`PASS: Worker returned local 404s for ${result.blockedCases} /api route/method cases; upstream fetches=${result.upstreamFetches}, /api asset lookups=${result.apiAssetFetches}, credentials echoed=${result.credentialsEchoed}, port-4000 traffic=${result.port4000Traffic}.`)
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
