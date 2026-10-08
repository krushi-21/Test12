function apiUnavailable() {
  return Response.json(
    { error: { code: 'API_UNAVAILABLE', message: 'The API is disabled in this synthetic demo.' } },
    { status: 404, headers: { 'Cache-Control': 'no-store' } },
  )
}

function isApiPath(pathname) {
  const normalized = pathname.toLowerCase()
  return normalized === '/api' || normalized.startsWith('/api/') || normalized.startsWith('/api%2f')
}

export default {
  fetch(request, env) {
    const incoming = new URL(request.url)
    if (isApiPath(incoming.pathname)) return apiUnavailable()
    return env.ASSETS.fetch(request)
  },
}
