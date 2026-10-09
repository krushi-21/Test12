import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CommunityProfilePage } from '../src/pages-community'
import { CollectionsPage, ForYouPage, FollowingPage, ReviewsSection } from '../src/test-features'
import { InteractiveTestMode } from '../src/test-mode'
import '../src/test-mode.css'

type MockRequest = { path: string; method: string; body?: unknown; credentials?: RequestCredentials; cache?: RequestCache }
declare global { interface Window { __communityQaRequests: MockRequest[]; __communityQaReady: boolean; __communityQaForYouPending: Array<() => void>; __communityQaReleaseForYouLoading: () => void } }

const requests: MockRequest[] = []
window.__communityQaRequests = requests
window.__communityQaForYouPending = []
window.__communityQaReleaseForYouLoading = () => { window.__communityQaForYouPending.splice(0).forEach(release => release()) }
const originalFetch = window.fetch.bind(window)
const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
const now = '2026-10-08T05:00:00.000Z'
const testCase = new URLSearchParams(window.location.search).get('case') || ''
const isSignedOutCase = testCase.endsWith('signed-out')
const isUnverifiedCase = testCase.endsWith('unverified')
const sessionUser = { id: 'synthetic-verified-member', displayName: 'Synthetic Member', email: 'member@example.invalid', emailVerified: !isUnverifiedCase }
const savedBusiness = (id: string, slug: string, name: string) => ({ id, slug, name, logoUrl: '', tagline: `${name} synthetic tagline`, category: 'Synthetic Art', city: 'Ahmedabad', state: 'Gujarat', businessMode: 'physical', savedAt: now })

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const address = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const url = new URL(address, window.location.origin)
  const method = (init?.method || 'GET').toUpperCase()
  let body: unknown
  if (typeof init?.body === 'string') { try { body = JSON.parse(init.body) } catch { body = init.body } }
  requests.push({ path: `${url.pathname}${url.search}`, method, body, credentials: init?.credentials, cache: init?.cache })
  if (url.pathname === '/api/me' && method === 'GET') return isSignedOutCase ? json({ error: { message: 'Sign in required.' } }, 401) : json({ user: sessionUser })
  if (url.pathname === '/api/categories' && method === 'GET') return json({ categories: [{ id: 'category-art', name: 'Synthetic Art', slug: 'synthetic-art' }, { id: 'category-food', name: 'Synthetic Food', slug: 'synthetic-food' }] })
  if (url.pathname === '/api/discover/businesses' && method === 'GET') return json({ items: [{
    id: 'business-save-target', slug: 'synthetic-save-target', name: 'Synthetic Save Target', description: 'Synthetic business for UI verification.', tagline: 'Synthetic tagline', category: 'Synthetic Art', city: 'Ahmedabad', state: 'Gujarat', businessMode: 'physical', saveCount: 7, isSaved: false, links: {},
  }], nextCursor: null })
  if (url.pathname === '/api/brands/synthetic-save-target' && method === 'GET') return json({ item: {
    id: 'business-save-target', slug: 'synthetic-save-target', name: 'Synthetic Save Target', description: 'Synthetic business for UI verification.', category: 'Synthetic Art', city: 'Ahmedabad', state: 'Gujarat', businessMode: 'physical', viewerIsOwner: testCase === 'brand-owner', saveCount: 7, isSaved: false, links: {}, products: [], launches: [],
  } })
  if (url.pathname === '/api/brands/synthetic-save-target/reviews' && method === 'GET') return json({ item: {
    count: 0, average: 0, averages: { quality: 0, value: 0, experience: 0, recommendRate: 0 }, ownReview: null, items: [],
  } })
  if (url.pathname === '/api/businesses/synthetic-save-target/save' && method === 'PUT') {
    if (testCase === 'discovery-self-save-403') return json({ error: { message: 'You cannot save your own business.' } }, 403)
    return json({ saved: true })
  }
  if (url.pathname === '/api/businesses/synthetic-save-target/save' && method === 'DELETE') return json({ saved: false })
  if (url.pathname === '/api/me/saved-businesses' && method === 'GET') {
    if (testCase === 'saved-empty') return json({ items: [], nextCursor: null })
    if (url.searchParams.get('cursor') === 'opaque:next/page-2') return json({ items: [savedBusiness('saved-three', 'synthetic-three', 'Synthetic Three')], nextCursor: null })
    return json({ items: [savedBusiness('saved-one', 'synthetic-one', 'Synthetic One'), savedBusiness('saved-two', 'synthetic-two', 'Synthetic Two')], nextCursor: testCase === 'saved-populated' ? 'opaque:next/page-2' : null })
  }
  if (url.pathname === '/api/for-you' && method === 'GET') {
    if (testCase === 'for-you-loading') return new Promise(resolve => window.__communityQaForYouPending.push(() => resolve(json({ items: [forYouLaunch('for-you-loading-launch', 'Loading Fixture Launch')], nextCursor: null, coldStart: false, rankingMode: 'personalized' }))))
    if (testCase === 'for-you-error') return json({ error: { message: 'For You recommendations are temporarily unavailable.' } }, 503)
    if (testCase === 'for-you-empty') return json({ items: [], nextCursor: null, coldStart: true, rankingMode: 'popular_recent' })
    if (testCase === 'for-you-populated' && url.searchParams.get('cursor') === 'opaque:next/page-2') return json({ items: [forYouLaunch('for-you-launch-2', 'Synthetic Second Recommendation', 'Popular with makers in your categories')], nextCursor: null, coldStart: false, rankingMode: 'personalized' })
    const isSignedOut = testCase === 'for-you-signed-out'
    const firstItem = forYouLaunch(isSignedOut ? 'for-you-anonymous-launch' : 'for-you-launch-1', isSignedOut ? 'Synthetic Anonymous Recommendation' : 'Synthetic First Recommendation', isSignedOut ? 'A popular recent launch for visitors' : 'Near your selected location')
    return json({ items: [firstItem], nextCursor: testCase === 'for-you-populated' ? 'opaque:next/page-2' : null, coldStart: isSignedOut, rankingMode: isSignedOut ? 'popular_recent' : 'personalized' })
  }
  if (url.pathname === '/api/me/following' && method === 'GET') return json({ items: [forYouLaunch('following-regression-launch', 'Synthetic Following Launch')] })
  if (url.pathname === '/api/me/follows' && method === 'GET') return json({ items: [{ targetType: 'category', targetId: 'category-art' }] })
  if (url.pathname === '/api/me/follows/category/category-food' && method === 'PUT') return json({ following: true })
  if (url.pathname === '/api/brands/review-brand/reviews' && method === 'GET') return json({ item: {
    count: 2, average: 4.5, averages: { quality: 4.5, value: 4, experience: 4.5, recommendRate: 100 },
    ownReview: { id: 'review-own', overallRating: 5 },
    items: [
      { id: 'review-own', overallRating: 5, reviewerName: 'My synthetic review', wouldRecommend: true },
      { id: 'review-other', overallRating: 4, reviewerName: 'Another verified member', wouldRecommend: true },
    ],
  } })
  if (url.pathname === '/api/reviews/review-other/report' && method === 'POST') return json({ accepted: true }, 202)
  if (url.pathname === '/api/collections/share/synthetic-share-token' && method === 'GET') return json({ item: { id: 'public-with-token', name: 'Public synthetic collection', description: 'A sample public list for route coverage.', isPublic: true, shareUrl: '/test/collection/synthetic-share-token', launchCount: 1, launches: [{ id: 'collection-launch', slug: 'synthetic-launch', title: 'A Synthetic Maker Story', summary: 'A fictional launch story.', category: 'Synthetic Art', launchType: 'product', images: [{ url: '/images/launch-craft.webp', altText: 'Synthetic craft image' }], brand: { id: 'collection-brand', slug: 'synthetic-brand', name: 'Synthetic Studio' } }] } })
  if (url.pathname === '/api/collections/public' && method === 'GET') return json({ items: [
    { id: 'public-with-token', name: 'Public synthetic collection', description: 'A sample public list for route coverage.', isPublic: true, shareUrl: '/test/collection/synthetic-share-token', launchCount: 1, launches: [{ id: 'collection-launch', slug: 'synthetic-launch', title: 'A Synthetic Maker Story', summary: 'A fictional launch story.', category: 'Synthetic Art', launchType: 'product', images: [{ url: '/images/launch-craft.webp', altText: 'Synthetic craft image' }], brand: { id: 'collection-brand', slug: 'synthetic-brand', name: 'Synthetic Studio' } }] },
    { id: 'public-without-token', name: 'Public collection without share token', isPublic: true, launchCount: 0, launches: [] },
  ], nextCursor: null })
  if (url.pathname === '/api/me/collections' && method === 'GET') return json({ items: [
    { id: 'private-without-token', name: 'Private synthetic collection', isPublic: false, launchCount: 0, launches: [] },
    { id: 'public-without-token', name: 'Public but tokenless collection', isPublic: true, launchCount: 0, launches: [] },
    { id: 'public-with-token', name: 'Public synthetic collection', isPublic: true, shareUrl: '/test/collection/synthetic-share-token', launchCount: 0, launches: [] },
  ] })
  if (url.pathname === '/api/admin/reports' && method === 'GET') return json({ items: [{
    id: 'synthetic-content-report', subjectType: 'launch', subjectId: 'synthetic-launch', reason: 'misleading', details: 'Synthetic test report only.', status: url.searchParams.get('status') || 'open', createdAt: now,
    subjectPreview: { name: 'Synthetic Launch Report', status: 'published' },
  }] })
  if (url.pathname === '/api/admin/reviews/reports' && method === 'GET') return json({ items: [{ id: 'synthetic-review-report', reason: 'other', createdAt: now, reviewId: 'review-flagged', brandId: 'synthetic-brand', rating: 2 }] })
  if (url.pathname === '/api/admin/reports/synthetic-content-report/actions' && method === 'POST') return json({ report: { id: 'synthetic-content-report' }, subjectStatus: 'published' })
  if (url.pathname === '/api/admin/reviews/review-flagged/actions' && method === 'POST') return json({ action: (body as { action?: string } | undefined)?.action, reviewId: 'review-flagged' })
  return json({ error: { message: `Unexpected mocked API request: ${method} ${url.pathname}` } }, 404)
}

const user = { id: 'synthetic-verified-member', displayName: 'Synthetic Member', email: 'member@example.invalid', emailVerified: true }
const bookmarkState = new URLSearchParams(window.location.search).get('bookmarkState')
const profileUser = bookmarkState === 'signed-out' ? null : bookmarkState === 'unverified' ? { ...user, emailVerified: false } : user
function previewPath() {
  if (testCase === 'community-hub') return '/test/samples/community'
  if (testCase === 'collection-share') return '/test/collection/synthetic-share-token'
  if (testCase.startsWith('brand-')) return '/test/brand/synthetic-save-target'
  if (testCase.startsWith('saved-')) return '/test/saved-businesses'
  return '/test/nearby'
}
export function Harness() {
  if (testCase.startsWith('for-you-') || testCase.startsWith('feed-switch-') || testCase === 'following-regression') {
    const initialPath = testCase === 'feed-switch-following' || testCase === 'following-regression' ? '/test/following' : '/test/for-you'
    const feedUser = isSignedOutCase ? null : sessionUser
    return <MemoryRouter initialEntries={[initialPath]}><Routes>
      <Route path="/test/for-you" element={<ForYouPage />} />
      <Route path="/test/following" element={<FollowingPage user={feedUser} />} />
    </Routes></MemoryRouter>
  }
  if (testCase) return <MemoryRouter initialEntries={[previewPath()]}><InteractiveTestMode /></MemoryRouter>
  return <MemoryRouter initialEntries={['/test/community-ui-harness']}>
    <main data-testid="community-ui-test-ready">
      <CommunityProfilePage embedded user={profileUser} />
      <ReviewsSection slug="review-brand" user={user} />
      <CollectionsPage user={user} />
    </main>
  </MemoryRouter>
}

function forYouLaunch(id: string, title: string, recommendationReason = 'Near your selected location') {
  return {
    id, slug: id, title, summary: 'A synthetic public launch used only in the isolated For You UI harness.', story: 'Synthetic preview story.', category: 'Synthetic Art', launchType: 'product',
    images: [{ url: '/images/launch-craft.webp', altText: 'Synthetic launch sample image' }],
    brand: { id: 'synthetic-brand-for-you', slug: 'synthetic-brand-for-you', name: 'Synthetic For You Studio', logoUrl: '/images/growth-maker.jpg' },
    founders: [{ id: 'synthetic-founder-for-you', displayName: 'Synthetic Founder' }], location: { city: 'Ahmedabad', state: 'Gujarat' },
    lifecycleStage: 'live', publishedAt: now, recommendationReason,
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>)
window.__communityQaReady = true
void originalFetch
