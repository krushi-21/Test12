const SAFE_METHODS = new Set(['GET', 'HEAD'])
const API_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX_REQUESTS = 600
const DEFAULT_MAX_MUTATING_REQUESTS = 120
const DEFAULT_MAX_CLIENTS = 4096

function validateOrigin(origin) {
  let parsed
  try { parsed = new URL(origin) } catch { throw new Error('The synthetic preview requires an exact HTTP(S) origin.') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error('The synthetic preview requires an exact HTTP(S) origin without a path.')
  }
  return origin
}

function sendApiError(res, status, code, message, retryAfter) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (retryAfter) res.setHeader('Retry-After', String(retryAfter))
  res.end(JSON.stringify({ error: { code, message } }))
}

function sendTestError(res, status, message) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
  res.end(`<!doctype html><title>Request denied</title><p>${message}</p>`)
}

export function createSyntheticPreviewProxyGuard({
  origin,
  now = Date.now,
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  maxMutatingRequests = DEFAULT_MAX_MUTATING_REQUESTS,
  maxClients = DEFAULT_MAX_CLIENTS
}) {
  validateOrigin(origin)
  if (!Number.isInteger(windowMs) || windowMs < 1 || !Number.isInteger(maxRequests) || maxRequests < 1 ||
      !Number.isInteger(maxMutatingRequests) || maxMutatingRequests < 1 ||
      !Number.isInteger(maxClients) || maxClients < 1) {
    throw new Error('Synthetic preview proxy limits must be positive integers.')
  }

  const requestsByPeer = new Map()

  function takeRateLimit(req, isMutating) {
    const timestamp = now()
    const peer = req.socket?.remoteAddress ?? 'unknown'
    let bucket = requestsByPeer.get(peer)
    if (!bucket || bucket.resetAt <= timestamp) {
      if (!bucket && requestsByPeer.size >= maxClients) {
        const oldestPeer = requestsByPeer.keys().next().value
        if (oldestPeer !== undefined) requestsByPeer.delete(oldestPeer)
      }
      bucket = { resetAt: timestamp + windowMs, requests: 0, mutations: 0 }
    }
    bucket.requests += 1
    if (isMutating) bucket.mutations += 1
    requestsByPeer.delete(peer)
    requestsByPeer.set(peer, bucket)

    if (bucket.requests > maxRequests || bucket.mutations > maxMutatingRequests) {
      return Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000))
    }
    return 0
  }

  return function syntheticPreviewProxyGuard(req, res, next) {
    let pathname
    try { pathname = new URL(req.url ?? '/', 'http://preview.invalid').pathname } catch {
      return sendApiError(res, 400, 'INVALID_REQUEST', 'The request path is invalid.')
    }

    const isApiPath = pathname === '/api' || pathname.startsWith('/api/')
    const isTestPath = pathname === '/test' || pathname.startsWith('/test/')
    if (!isApiPath && !isTestPath) return next()

    // Remove the retired credential endpoint rather than leaving a misleading login route behind.
    if (pathname === '/test/login' || pathname === '/test/logout') {
      return sendTestError(res, 404, 'This preview route is not available.')
    }

    const method = (req.method ?? 'GET').toUpperCase()
    const isSafe = SAFE_METHODS.has(method)
    if (isTestPath && !isSafe) return sendTestError(res, 405, 'Only read requests are accepted for preview pages.')
    if (isApiPath && !API_METHODS.has(method)) {
      return sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'This API method is not available through the synthetic preview.')
    }

    const requestOrigin = req.headers.origin
    const fetchSite = req.headers['sec-fetch-site']
    if ((requestOrigin && requestOrigin !== origin) ||
        (isApiPath && (fetchSite === 'cross-site' || fetchSite === 'same-site'))) {
      if (isApiPath) return sendApiError(res, 403, 'TEST_PREVIEW_ORIGIN_DENIED', 'This browser origin is not allowed.')
      return sendTestError(res, 403, 'This browser origin is not allowed.')
    }

    if (isApiPath && !isSafe) {
      if (requestOrigin !== origin || (fetchSite && fetchSite !== 'same-origin')) {
        return sendApiError(res, 403, 'TEST_PREVIEW_ORIGIN_DENIED', 'State-changing preview requests require the exact same browser origin.')
      }
    }

    if (isApiPath) {
      const retryAfter = takeRateLimit(req, !isSafe)
      if (retryAfter) return sendApiError(res, 429, 'TEST_PREVIEW_RATE_LIMITED', 'The synthetic preview is receiving too many API requests. Wait and try again.', retryAfter)
    }

    return next()
  }
}
