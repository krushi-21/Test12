import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Bell, Bookmark, CalendarDays, Compass, Home, MapPin, Search, Sparkles, Store, TrendingUp, UserRound, type LucideIcon } from 'lucide-react'
import './test-mode.css'
import './discovery-visual.css'
import { AddToCollection, BusinessDiscoveryPage, BusinessProfileEditorPage, CollectionSharePage, CollectionsPage, ContactActions, FollowBusiness, FollowTarget, ForYouPage, FounderDashboardPage, FounderProfileEditorPage, FollowingPage, LifecyclePanel, NotificationsPage, ReviewsSection, TrendingPage, UpcomingPage } from './test-features'
import { AarambhHomepage, SyntheticFounderPage } from './test-homepage'
import { CommunityProfilePage } from './pages-community'
import { GrowthAnalyticsPage, GrowthNotificationsPage, GrowthTrendingPage, LaunchLifecyclePage } from './pages-growth'

type ApiUser = { id: string; displayName: string; email: string; emailVerified: boolean }
type ApiCategory = { id: string; name: string; slug: string }
type ApiFounder = { id: string; slug?: string; displayName: string }
type ApiLaunch = {
  id: string; slug: string; title: string; launchType: string; category: string; summary?: string; story?: string;
  images: { url: string; altText: string }[]; brand: { id: string; slug: string; name: string; logoUrl?: string };
  founders: ApiFounder[]; location?: { city?: string; area?: string; state?: string; address?: string; latitude?: number; longitude?: number }; launchAt?: string; endsAt?: string; engagement?: { likes: number };
  viewerState?: { liked: boolean; saved: boolean };
}
type ApiProduct = { id: string; brandId?: string; name: string; description: string; priceInrPaise?: number; imageUrl?: string; buyUrl: string; createdAt?: string }
type ApiBrand = { id: string; slug: string; name: string; logoUrl?: string; category: string; description?: string; status?: string; city?: string; state?: string; area?: string; address?: string; latitude?: number; longitude?: number; businessMode?: string; contactPhone?: string; contactEmail?: string; founderEmailVerified?: boolean; viewerIsOwner?: boolean; isSaved?: boolean; saveCount?: number; links?: { website?: string; instagram?: string; whatsapp?: string; phone?: string; email?: string; quote?: string; demo?: string; store?: string }; launches?: ApiLaunch[]; products?: ApiProduct[] }
type ApiMessage = { to: string; subject: string; createdAt: string; verificationUrl?: string }
type ApiErrorShape = { error?: { message?: string; fields?: Record<string, string> } }

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' })
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({})) as T & ApiErrorShape
  if (!response.ok) throw new Error(payload.error?.message || `Request failed (${response.status}).`)
  return payload
}

function jsonBody(value: unknown): string { return JSON.stringify(value) }

async function uploadFixture(purpose: 'brand-logo' | 'launch-carousel' | 'product-image') {
  const fixturePath = purpose === 'launch-carousel' ? '/images/launch-home.jpg' : '/images/launch-craft.webp'
  const fixture = await fetch(fixturePath)
  if (!fixture.ok) throw new Error('The bundled synthetic sample image could not be loaded.')
  const blob = await fixture.blob()
  const file = new File([blob], purpose === 'brand-logo' ? 'synthetic-brand-logo.webp' : purpose === 'product-image' ? 'synthetic-product-image.webp' : 'synthetic-launch-image.jpg', { type: blob.type })
  const form = new FormData()
  form.set('purpose', purpose)
  form.set('file', file)
  const result = await api<{ asset: { id: string; url: string } }>('/uploads', { method: 'POST', body: form })
  return result.asset
}

async function uploadProductFile(file: File) {
  const form = new FormData()
  form.set('purpose', 'product-image')
  form.set('file', file)
  const result = await api<{ asset: { id: string; url: string } }>('/uploads', { method: 'POST', body: form })
  return result.asset
}

function errorText(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.' }

const TestSessionContext = createContext<{ user: ApiUser | null; loading: boolean; refresh: () => Promise<void> } | null>(null)
function useTestSession() {
  const context = useContext(TestSessionContext)
  if (!context) throw new Error('Interactive test session is not available.')
  return context
}

type ShellLinkItem = { label: string; to: string; icon: LucideIcon; testId?: string }

const discoverShellLinks: ShellLinkItem[] = [
  { label: 'Discover', to: '/test', icon: Compass },
  { label: 'Ahmedabad', to: '/test/nearby?city=Ahmedabad', icon: MapPin },
  { label: 'Search', to: '/test#home-unified-search', icon: Search },
  { label: 'Saved & collections', to: '/test/saved-businesses', icon: Bookmark, testId: 'saved-businesses-nav' },
  { label: 'Notifications', to: '/test/notifications', icon: Bell },
  { label: 'My profile', to: '/test/founder-profile', icon: UserRound },
]

const referenceShellLinks: ShellLinkItem[] = [
  { label: 'Log in / sign up', to: '/test/account', icon: UserRound },
  { label: 'Launch detail', to: '/test/launch/sample-release-notes', icon: Sparkles },
  { label: 'Business profile', to: '/test/brand/sample-orbit-labs', icon: Store },
  { label: 'Create a launch', to: '/test/workspace', icon: ArrowUpRight },
  { label: 'Founder dashboard', to: '/test/dashboard', icon: TrendingUp },
  { label: 'Manage business', to: '/test/business-profile', icon: Store },
  { label: 'Account', to: '/test/account', icon: UserRound },
  { label: 'Empty states', to: '/test/saved-businesses', icon: Bookmark },
]

const moreShellLinks: ShellLinkItem[] = [
  { label: 'Explore near you', to: '/test/nearby', icon: MapPin },
  { label: 'Following', to: '/test/following', icon: UserRound },
  { label: 'Collections', to: '/test/collections', icon: Bookmark },
  { label: 'Upcoming', to: '/test/upcoming', icon: CalendarDays },
  { label: 'Trending', to: '/test/trending', icon: TrendingUp },
  { label: 'Leaderboard', to: '/test/leaderboard', icon: TrendingUp },
  { label: 'Founder workspace', to: '/test/workspace', icon: Store },
  { label: 'Community sample', to: '/test/samples/community', icon: Compass },
  { label: 'Launch calendar sample', to: '/test/samples/launch-calendar', icon: CalendarDays },
  { label: 'Analytics sample', to: '/test/samples/analytics', icon: TrendingUp },
  { label: 'Trending sample', to: '/test/samples/trending', icon: TrendingUp },
  { label: 'Notifications sample', to: '/test/samples/notifications', icon: Bell },
]

type MobileTabKey = 'home' | 'explore' | 'saved' | 'profile'
const mobileShellTabs: Array<ShellLinkItem & { key: MobileTabKey }> = [
  { key: 'home', label: 'Home', to: '/test', icon: Home },
  { key: 'explore', label: 'Explore', to: '/test/nearby', icon: Compass },
  { key: 'saved', label: 'Saved', to: '/test/saved-businesses', icon: Bookmark },
  { key: 'profile', label: 'Profile', to: '/test/account', icon: UserRound },
]

function normalizeShellPath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname
}

function isRouteFamily(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

function activeMobileTabForPath(pathname: string): MobileTabKey | undefined {
  const path = normalizeShellPath(pathname)
  if (path === '/test' || path === '/test/') return 'home'
  if (['/test/saved-businesses', '/test/collections', '/test/collection'].some(route => isRouteFamily(path, route))) return 'saved'
  if (['/test/account', '/test/workspace', '/test/dashboard', '/test/analytics', '/test/business-profile', '/test/founder-profile', '/test/brand', '/test/founder', '/test/samples/analytics'].some(route => isRouteFamily(path, route))) return 'profile'
  if (['/test/for-you', '/test/nearby', '/test/launch', '/test/following', '/test/leaderboard', '/test/upcoming', '/test/trending', '/test/samples/community', '/test/samples/launch-calendar', '/test/samples/trending'].some(route => isRouteFamily(path, route))) return 'explore'
  return undefined
}

function sidebarLinkMatchesLocation(item: ShellLinkItem, location: { pathname: string; search: string; hash: string }) {
  const target = new URL(item.to, 'https://aarambh.invalid')
  const targetPath = normalizeShellPath(target.pathname)
  const currentPath = normalizeShellPath(location.pathname)
  if (targetPath !== currentPath) return false
  if (target.hash ? location.hash !== target.hash : Boolean(location.hash)) return false
  const currentSearch = new URLSearchParams(location.search)
  for (const [key, value] of new URLSearchParams(target.search)) {
    if (currentSearch.get(key) !== value) return false
  }
  // The specific city link owns Ahmedabad discovery; the generic nearby link
  // remains current for the unfiltered route and other city selections.
  if (!target.search && targetPath === '/test/nearby' && currentSearch.get('city') === 'Ahmedabad') return false
  return true
}

function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ user: ApiUser }>('/me')
      setUser(result.user)
    } catch { setUser(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    let active = true
    void api<{ user: ApiUser }>('/me').then(result => { if (active) setUser(result.user) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const value = useMemo(() => ({ user, loading, refresh }), [user, loading, refresh])
  return <TestSessionContext.Provider value={value}>{children}</TestSessionContext.Provider>
}

function TestShell({ children }: { children: ReactNode }) {
  const { user, loading } = useTestSession()
  const location = useLocation()
  const pathname = location.pathname
  const currentPath = normalizeShellPath(pathname)
  const activeSidebarLink = [...discoverShellLinks, ...referenceShellLinks, ...moreShellLinks].find(item => sidebarLinkMatchesLocation(item, location))
  const activeMobileTab = activeMobileTabForPath(pathname)
  const showMobileNav = (currentPath === '/test' || currentPath.startsWith('/test/')) && currentPath !== '/test/account'
  const notificationsCurrent = currentPath === '/test/notifications'
  const sidebarMenuRef = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const compactQuery = window.matchMedia('(max-width: 900px)')
    const syncMenuVisibility = () => {
      if (sidebarMenuRef.current) sidebarMenuRef.current.open = !compactQuery.matches
    }
    syncMenuVisibility()
    compactQuery.addEventListener('change', syncMenuVisibility)
    return () => compactQuery.removeEventListener('change', syncMenuVisibility)
  }, [])
  const renderSidebarLink = (item: ShellLinkItem) => {
    const { label, to, icon: Icon, testId } = item
    const active = activeSidebarLink === item
    return <Link key={`${label}-${to}`} to={to} onClick={event => {
      const menu = event.currentTarget.closest('details.test-sidebar-menu')
      if (menu instanceof HTMLDetailsElement && window.matchMedia('(max-width: 900px)').matches) menu.open = false
    }} className={`test-nav-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} data-testid={testId}>
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
    </Link>
  }
  return <div className="site test-site">
    <aside className="test-mode-banner"><strong>Interactive test mode · isolated and disposable</strong><span>Fictional records only. Never enter real personal information.</span></aside>
    <div className="test-shell-frame">
      <aside className="test-sidebar" aria-label="Aarambh app navigation">
        <div className="test-sidebar-header">
          <Link className="test-wordmark" to="/test" aria-label="Aarambh home">aarambh<span>.</span></Link>
          <p className="test-sidebar-tagline">Discover India’s next good thing.</p>
        </div>
        <details ref={sidebarMenuRef} className="test-sidebar-menu">
          <summary><span>Menu</span><ArrowUpRight size={16} aria-hidden="true" /></summary>
          <nav className="test-nav test-sidebar-nav" aria-label="Primary navigation">
            <section className="test-nav-group" aria-labelledby="test-discover-nav-title">
              <h2 id="test-discover-nav-title" className="test-nav-group-title">Discover</h2>
              {discoverShellLinks.map(renderSidebarLink)}
            </section>
            <section className="test-nav-group" aria-labelledby="test-reference-nav-title">
              <h2 id="test-reference-nav-title" className="test-nav-group-title">Reference Screens</h2>
              {referenceShellLinks.map(renderSidebarLink)}
            </section>
            <details className="test-nav-more">
              <summary>More preview routes</summary>
              <div className="test-nav-more-links">{moreShellLinks.map(renderSidebarLink)}</div>
            </details>
            <Link className="test-nav-link test-sidebar-account" to="/test/account">
              <UserRound size={16} strokeWidth={1.8} aria-hidden="true" /><span>{loading ? 'Account…' : user ? user.displayName : 'Sign in / register'}</span>
            </Link>
          </nav>
        </details>
        <div className="test-sidebar-footer">
          <Link className="test-static-link" to="/">Static preview <ArrowUpRight size={14} aria-hidden="true" /></Link>
          <span>Interactive · synthetic data only</span>
        </div>
      </aside>
      <div className={`test-shell-content${showMobileNav ? ' has-mobile-nav' : ''}`}>
        <main className="test-main" id="main-content">{children}</main>
        <footer className="test-footer"><span>Local synthetic API · in-memory database · SMTP disabled</span><span>Restarting the preview resets all test data.</span></footer>
        <Link className={`test-mobile-notifications${notificationsCurrent ? ' is-active' : ''}`} to="/test/notifications" aria-label="Notifications" aria-current={notificationsCurrent ? 'page' : undefined}>
          <Bell size={18} strokeWidth={1.9} aria-hidden="true" /><span>Notifications</span>
        </Link>
        {showMobileNav && <nav className="test-mobile-nav" aria-label="Primary navigation" data-testid="shared-mobile-nav">
          {mobileShellTabs.map(({ key, label, to, icon: Icon }) => {
            const active = activeMobileTab === key
            return <Link key={key} to={to} aria-current={active ? 'page' : undefined}>
              <Icon size={18} strokeWidth={1.9} aria-hidden="true" /><span>{label}</span>
            </Link>
          })}
        </nav>}
      </div>
    </div>
  </div>
}

function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'success' | 'error' }) {
  return <div className={`test-notice test-notice-${kind}`} role="status">{children}</div>
}

function TestPageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div className="test-page-heading"><span>{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
}

function LaunchEngagement({ launch, compact = false }: { launch: ApiLaunch; compact?: boolean }) {
  const { user } = useTestSession()
  const [liked, setLiked] = useState(Boolean(launch.viewerState?.liked))
  const [saved, setSaved] = useState(Boolean(launch.viewerState?.saved))
  const [likeCount, setLikeCount] = useState(launch.engagement?.likes ?? 0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  async function toggle(action: 'like' | 'save') {
    if (!user?.emailVerified) return
    setBusy(true); setNotice('')
    try {
      const active = action === 'like' ? liked : saved
      if (action === 'like') {
        const result = await api<{ liked: boolean; likeCount: number }>(`/launches/${encodeURIComponent(launch.slug)}/like`, { method: active ? 'DELETE' : 'PUT' })
        setLiked(result.liked); setLikeCount(result.likeCount)
      } else {
        const result = await api<{ saved: boolean }>(`/launches/${encodeURIComponent(launch.slug)}/save`, { method: active ? 'DELETE' : 'PUT' })
        setSaved(result.saved)
      }
      setNotice(action === 'like' ? 'Like updated locally.' : 'Bookmark updated locally.')
    } catch (err) { setNotice(errorText(err)) }
    finally { setBusy(false) }
  }
  return <div className={`test-engagement-actions ${compact ? 'test-engagement-compact' : ''}`}>
    <span className="test-like-count">{likeCount} {likeCount === 1 ? 'like' : 'likes'}</span>
    {user?.emailVerified ? <div className="test-action-row">
      <button type="button" className="test-button test-button-secondary" aria-pressed={liked} disabled={busy} onClick={() => void toggle('like')}>{liked ? 'Unlike' : 'Like'}</button>
      <button type="button" className="test-button test-button-secondary" aria-pressed={saved} disabled={busy} onClick={() => void toggle('save')}>{saved ? 'Remove save' : 'Save launch'}</button>
    </div> : <Link className="test-engagement-signin" to="/test/account">{user ? 'Verify a synthetic account to like or save' : 'Sign in to like or save'}</Link>}
    {notice && <span className={`test-engagement-notice ${notice.includes('updated') ? 'is-success' : 'is-error'}`} role="status">{notice}</span>}
  </div>
}

function LaunchTile({ launch, categoryName, source = 'search' }: { launch: ApiLaunch; categoryName?: string; source?: string }) {
  const launchHref = `/test/launch/${launch.slug}?source=${encodeURIComponent(source)}`
  const brandHref = `/test/brand/${launch.brand.slug}?source=${encodeURIComponent(source)}`
  return <article className="test-launch-card">
    <Link to={launchHref} className="test-launch-image" aria-label={`Open ${launch.title}`}>
      {launch.images[0] && <img src={launch.images[0].url} alt={launch.images[0].altText} loading="lazy" />}
    </Link>
    <div className="test-launch-content">
      <div className="test-chips"><span>{categoryName || launch.category}</span><span>{launch.launchType}</span></div>
      <h2><Link to={launchHref}>{launch.title}</Link></h2>
      <p>{launch.summary || launch.story || 'Synthetic sample launch.'}</p>
      <div className="test-launch-meta"><Link to={brandHref}>{launch.brand.name}</Link><span>{[launch.location?.city, launch.location?.state].filter(Boolean).join(', ')}</span></div>
      <LaunchEngagement launch={launch} compact />
      <Link className="test-inline-link" to={launchHref}>View synthetic launch</Link>
    </div>
  </article>
}

function LaunchPage({ slug }: { slug: string }) {
  const { user } = useTestSession()
  const location = useLocation()
  const source = new URLSearchParams(location.search).get('source') || 'direct'
  const [launch, setLaunch] = useState<ApiLaunch | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    void api<{ item: ApiLaunch }>(`/launches/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`)
      .then(result => { if (active) { setLaunch(result.item); setError('') } })
      .catch(err => { if (active) setError(errorText(err)) })
    return () => { active = false }
  }, [slug, source])
  async function share() {
    if (!launch) return
    setBusy(true); setNotice('')
    try {
      await api(`/launches/${launch.slug}/share`, { method: 'POST', body: jsonBody({ source }) })
      try { await navigator.clipboard.writeText(`${window.location.origin}/test/launch/${launch.slug}`) } catch { /* clipboard permission is optional */ }
      setNotice('Share event recorded locally. No external destination was opened.')
    } catch (err) { setNotice(errorText(err)) }
    finally { setBusy(false) }
  }
  if (error) return <section className="test-content-width"><TestPageHeading eyebrow="SYNTHETIC DETAIL" title="Launch unavailable" /><Notice kind="error">{error}</Notice><Link className="test-button test-button-primary" to="/test">Back to browse</Link></section>
  if (!launch) return <section className="test-content-width"><Notice>Loading synthetic launch…</Notice></section>
  return <section className="test-content-width test-detail-page">
    <Link to="/test" className="test-back-link">← Back to browse</Link>
    <div className="test-detail-grid">
      <div className="test-detail-image">{launch.images[0] && <img src={launch.images[0].url} alt={launch.images[0].altText} />}</div>
      <article className="test-detail-copy">
        <div className="test-chips"><span>{launch.category}</span><span>{launch.launchType}</span><span>synthetic</span></div>
        <h1>{launch.title}</h1><p className="test-detail-summary">{launch.summary || launch.story}</p>
        <p>{launch.story}</p>
        <div className="test-profile-links"><Link to={`/test/brand/${launch.brand.slug}?source=${encodeURIComponent(source)}`}>Brand: {launch.brand.name}</Link>{launch.founders.map(founder => <span key={founder.id}>Founder: {founder.displayName} <FollowTarget targetType="founder" targetId={founder.id} label="Follow founder" user={user} /></span>)}</div>
        <LifecyclePanel launch={launch} user={user} />
        <div className="test-workspace-card"><AddToCollection launch={launch} user={user} /></div>
        <div className="test-engagement-panel"><strong>Local engagement</strong>
          <LaunchEngagement key={launch.id} launch={launch} />
          {user && <div className="test-action-row"><button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => void share()}>Record share</button></div>}
          {notice && <Notice kind={notice.includes('updated') || notice.includes('recorded') ? 'success' : 'error'}>{notice}</Notice>}
        </div>
      </article>
    </div>
  </section>
}

function ProductCard({ product, brandId, source = 'direct' }: { product: ApiProduct; brandId: string; source?: string }) {
  let isDemoLink = false
  try { isDemoLink = new URL(product.buyUrl).hostname.toLowerCase().endsWith('.invalid') } catch { /* malformed links are rejected by the API */ }
  const price = product.priceInrPaise === undefined ? null : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(product.priceInrPaise / 100)
  return <article className="test-product-card">
    {product.imageUrl && <img src={product.imageUrl} alt={product.name} loading="lazy" />}
    <div className="test-product-copy"><h3>{product.name}</h3><p>{product.description}</p>
      {price && <strong className="test-product-price">{price}</strong>}
      {isDemoLink && <span className="test-demo-link-label">Demo link · reserved .invalid address</span>}
      <a className="test-button test-button-primary test-product-buy" href={product.buyUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={() => { void api(`/businesses/${encodeURIComponent(brandId)}/events`, { method: 'POST', body: jsonBody({ eventType: 'product_click', productId: product.id, source }) }).catch(() => {}) }}>View on business site ↗</a>
    </div>
  </article>
}

const activeBrandSaveRequests = new Set<string>()
function BrandPage({ slug }: { slug: string }) {
  const { user } = useTestSession()
  const location = useLocation()
  const source = new URLSearchParams(location.search).get('source') || 'direct'
  const [brand, setBrand] = useState<ApiBrand | null>(null)
  const [saveOverride, setSaveOverride] = useState<{ slug: string; saved: boolean; count: number } | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveNotice, setSaveNotice] = useState('')
  const [saveNoticeIsError, setSaveNoticeIsError] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { void api<{ item: ApiBrand }>(`/brands/${encodeURIComponent(slug)}?source=${encodeURIComponent(source)}`).then(result => setBrand(result.item)).catch(err => setError(errorText(err))) }, [slug, source])
  const saved = brand && saveOverride?.slug === brand.slug ? saveOverride.saved : Boolean(brand?.isSaved)
  const saveCount = brand && saveOverride?.slug === brand.slug ? saveOverride.count : brand?.saveCount ?? 0
  async function toggleSavedBusiness() {
    if (!brand || !user?.emailVerified || brand.viewerIsOwner || saveBusy) return
    const requestKey = `${user.id}:${brand.slug}`
    if (activeBrandSaveRequests.has(requestKey)) return
    activeBrandSaveRequests.add(requestKey)
    setSaveBusy(true)
    setSaveNotice('')
    try {
      const nextSaved = !saved
      const result = await api<{ saved: boolean }>(`/businesses/${encodeURIComponent(brand.slug)}/save`, { method: nextSaved ? 'PUT' : 'DELETE' })
      setSaveOverride({ slug: brand.slug, saved: result.saved, count: Math.max(0, saveCount + (result.saved ? 1 : -1)) })
      setSaveNotice(result.saved ? 'Business saved.' : 'Business removed from saved businesses.')
      setSaveNoticeIsError(false)
    } catch (err) {
      setSaveNotice(errorText(err))
      setSaveNoticeIsError(true)
    } finally { activeBrandSaveRequests.delete(requestKey); setSaveBusy(false) }
  }
  if (error) return <section className="test-content-width"><TestPageHeading eyebrow="SYNTHETIC BRAND" title="Brand unavailable" /><Notice kind="error">{error}</Notice></section>
  if (!brand) return <section className="test-content-width"><Notice>Loading synthetic brand…</Notice></section>
  return <section className="test-content-width test-brand-page">
    <Link to="/test" className="test-back-link">← Back to browse</Link>
    <div className="test-brand-hero">{brand.logoUrl && <img src={brand.logoUrl} alt="" />}<div><span className="test-eyebrow">Published synthetic brand</span><h1>{brand.name}</h1><p>{brand.description}</p><span>{brand.category}</span><p>{[brand.area, brand.city, brand.state].filter(Boolean).join(', ')}</p></div></div>
    <div className="test-action-row" data-testid="brand-save-control">
      {brand.viewerIsOwner
        ? <span className="test-muted" data-testid="brand-save-owner">You cannot save your own business.</span>
        : user?.emailVerified
          ? <button type="button" className="test-button test-button-secondary" aria-pressed={saved} disabled={saveBusy} onClick={() => void toggleSavedBusiness()}>{saved ? 'Remove saved business' : 'Save business'}</button>
          : <Link className="test-inline-link" to="/test/account">{user ? 'Verify email to save businesses' : 'Sign in to save businesses'}</Link>}
      <span className="test-muted" data-testid="brand-save-count">{saveCount} {saveCount === 1 ? 'save' : 'saves'}</span>
      <span role="status" data-testid="brand-save-notice" className={saveNoticeIsError ? 'test-notice-error' : ''}>{saveNotice}</span>
    </div>
    <div className="test-workspace-card"><div className="test-section-heading"><h2>Contact {brand.name}</h2><span>{brand.businessMode || 'online'}</span></div><ContactActions business={{ id: brand.id, slug: brand.slug, name: brand.name, city: brand.city, state: brand.state, area: brand.area, address: brand.address, latitude: brand.latitude, longitude: brand.longitude, links: brand.links || {} }} source={source} /><div className="test-action-row"><FollowBusiness business={{ id: brand.id, slug: brand.slug, name: brand.name, links: brand.links || {} }} user={user} onChange={() => {}} /><span className="test-muted">{brand.founderEmailVerified ? 'Founder email verified · not a business verification badge' : 'Founder email not verified'}</span></div></div>
    <div className="test-section-heading"><h2>Products from {brand.name}</h2><span>{brand.products?.length ?? 0} products</span></div>
    {brand.products?.length ? <div className="test-product-grid">{brand.products.map(product => <ProductCard key={product.id} product={product} brandId={brand.id} source={source} />)}</div> : <Notice>No products have been added to this synthetic brand yet.</Notice>}
    {user && <Link className="test-inline-link" to="/test/workspace">Manage products in the founder workspace</Link>}
    <div className="test-section-heading"><h2>Launches from {brand.name}</h2><span>{brand.launches?.length ?? 0} records</span></div>
    <div className="test-launch-list">{brand.launches?.map(item => <LaunchTile key={item.id} launch={item} />)}</div>
    <ReviewsSection slug={brand.slug} user={user} isOwner={brand.viewerIsOwner} />
  </section>
}

type SavedBusiness = { id: string; slug: string; name: string; logoUrl?: string; tagline?: string; category?: string; city?: string; state?: string; businessMode?: string; savedAt: string }
const savedBusinessesPageSize = 20
function SavedBusinessesPage({ user }: { user: ApiUser | null }) {
  const [items, setItems] = useState<SavedBusiness[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadedUserId, setLoadedUserId] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [changingId, setChangingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeKind, setNoticeKind] = useState<'success' | 'error'>('success')
  const userId = user?.id
  const loading = Boolean(userId && loadedUserId !== userId)
  useEffect(() => {
    if (!userId) return
    let active = true
    void api<{ items: SavedBusiness[]; nextCursor?: string | null }>(`/me/saved-businesses?limit=${savedBusinessesPageSize}`)
      .then(result => { if (active) { setItems(result.items); setNextCursor(result.nextCursor || null); setError(''); setLoadedUserId(userId) } })
      .catch(err => { if (active) { setError(errorText(err)); setLoadedUserId(userId) } })
    return () => { active = false }
  }, [userId])
  async function loadMore() {
    if (!user || !nextCursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: String(savedBusinessesPageSize), cursor: nextCursor })
      const result = await api<{ items: SavedBusiness[]; nextCursor?: string | null }>(`/me/saved-businesses?${params.toString()}`)
      setItems(current => [...current, ...result.items.filter(item => !current.some(existing => existing.id === item.id))])
      setNextCursor(result.nextCursor || null)
    } catch (err) { setError(errorText(err)) }
    finally { setLoadingMore(false) }
  }
  async function removeSavedBusiness(item: SavedBusiness) {
    if (!user?.emailVerified || changingId) return
    setChangingId(item.id)
    setError('')
    setNotice('')
    try {
      const result = await api<{ saved: boolean }>(`/businesses/${encodeURIComponent(item.slug)}/save`, { method: 'DELETE' })
      if (!result.saved) setItems(current => current.filter(savedItem => savedItem.id !== item.id))
      setNotice('Business removed from saved businesses.')
      setNoticeKind('success')
    } catch (err) { setNotice(errorText(err)); setNoticeKind('error') }
    finally { setChangingId('') }
  }
  return <section className="test-content-width test-feature-page" data-testid="saved-businesses-page">
    <TestPageHeading eyebrow="YOUR SAVED BUSINESSES" title="Saved businesses" description="Revisit businesses you have saved from discovery or their public profile." />
    {!user && <Notice><Link to="/test/account">Sign in to view your saved businesses.</Link></Notice>}
    {user && !user.emailVerified && <Notice>Your saved list is read-only until your synthetic account is verified.</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    {notice && <Notice kind={noticeKind}>{notice}</Notice>}
    {loading && <Notice>Loading saved businesses…</Notice>}
    {!loading && user && !error && items.length === 0 && <div data-testid="saved-businesses-empty"><Notice>You have not saved any businesses yet. <Link to="/test/nearby">Explore businesses</Link> to get started.</Notice></div>}
    {user && loadedUserId === user.id && items.length > 0 && <div className="test-business-grid" data-testid="saved-businesses-list">{items.map(item => <article className="test-business-card" data-testid="saved-business-card" data-business-slug={item.slug} key={item.id}>
      <div className="test-business-card-head"><div>{item.logoUrl && <img src={item.logoUrl} alt="" loading="lazy" />}<span className="test-eyebrow">{item.category || 'Business'}</span><h2><Link to={`/test/brand/${encodeURIComponent(item.slug)}`}>{item.name}</Link></h2><p>{item.tagline || 'Saved business'}</p></div><span className="test-status-chip">{item.businessMode || 'online'}</span></div>
      <div className="test-business-location">{[item.city, item.state].filter(Boolean).join(', ')}<span>Saved {new Date(item.savedAt).toLocaleDateString()}</span></div>
      <div className="test-action-row"><Link className="test-inline-link" to={`/test/brand/${encodeURIComponent(item.slug)}`}>View business</Link>{user?.emailVerified && <button type="button" className="test-button test-button-secondary" disabled={Boolean(changingId)} onClick={() => void removeSavedBusiness(item)}>{changingId === item.id ? 'Removing…' : 'Remove saved business'}</button>}</div>
    </article>)}</div>}
    {user && nextCursor && !loading && <button type="button" className="test-button test-button-secondary" data-testid="saved-businesses-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading…' : 'Load more saved businesses'}</button>}
  </section>
}

function LeaderboardPage() {
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly')
  const [result, setResult] = useState<{ items: { rank: number; score: number; launch: ApiLaunch }[]; forming: boolean; eligibleCount: number } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api<typeof result>(`/leaderboard?period=${period}`).then(value => setResult(value)).catch(err => setError(errorText(err))) }, [period])
  return <section className="test-content-width test-leaderboard-page">
    <TestPageHeading eyebrow="API-BACKED SAMPLE" title="Synthetic leaderboard" description="The isolated API calculates this view from only its disposable test records." />
    <div className="test-action-row"><button type="button" className={`test-button ${period === 'weekly' ? 'test-button-primary' : 'test-button-secondary'}`} onClick={() => setPeriod('weekly')}>Weekly</button><button type="button" className={`test-button ${period === 'monthly' ? 'test-button-primary' : 'test-button-secondary'}`} onClick={() => setPeriod('monthly')}>Monthly</button></div>
    {error && <Notice kind="error">{error}</Notice>}
    {result && <><p className="test-muted">Eligible records: {result.eligibleCount}. Formula remains provisional.</p>{result.forming ? <Notice>The synthetic leaderboard is forming.</Notice> : <ol className="test-rank-list">{result.items.map(entry => <li key={entry.launch.id}><strong>{entry.rank}</strong><Link to={`/test/launch/${entry.launch.slug}?source=trending`}>{entry.launch.title}</Link><span>{entry.score} sample points</span></li>)}</ol>}</>}
  </section>
}

function AccountPage() {
  const { user, loading, refresh } = useTestSession()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [displayName, setDisplayName] = useState('Sample Tester')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [outbox, setOutbox] = useState<ApiMessage[]>([])
  const [outboxExpanded, setOutboxExpanded] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeKind, setNoticeKind] = useState<'success' | 'error' | 'info'>('info')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const refreshOutbox = useCallback(async () => {
    try { setOutbox((await api<{ messages: ApiMessage[] }>('/__test/outbox')).messages); setOutboxExpanded(true) }
    catch { setOutbox([]); setOutboxExpanded(true) }
  }, [])
  useEffect(() => {
    let active = true
    void api<{ messages: ApiMessage[] }>('/__test/outbox').then(result => { if (active) setOutbox(result.messages) }).catch(() => { if (active) setOutbox([]) })
    return () => { active = false }
  }, [])
  function show(text: string, kind: 'success' | 'error' | 'info' = 'info') { setNotice(text); setNoticeKind(kind) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('')
    try {
      if (mode === 'login') {
        await api('/auth/login', { method: 'POST', body: jsonBody({ email, password }) })
        await refresh()
        show('Signed in to the synthetic test account.', 'success')
      } else {
        await api('/auth/register', { method: 'POST', body: jsonBody({ displayName, email, password }) })
        await refreshOutbox()
        show('Synthetic account created. Use its local verification message below; no email was sent.', 'success')
      }
    } catch (err) { show(errorText(err), 'error') }
    finally { setBusy(false) }
  }
  async function verify(url?: string) {
    if (!url) return
    const token = new URL(url).searchParams.get('token')
    if (!token) return show('This local message has no verification token.', 'error')
    setBusy(true)
    try { await api('/auth/verify-email', { method: 'POST', body: jsonBody({ token }) }); await refresh(); await refreshOutbox(); show('Synthetic email verified and a session was created.', 'success') }
    catch (err) { show(errorText(err), 'error') }
    finally { setBusy(false) }
  }
  async function resetFromMessage(url?: string) {
    if (!url) return
    const token = new URL(url).searchParams.get('token')
    if (!token || resetPassword.length < 12) return show('Set a new synthetic password of at least 12 characters first.', 'error')
    setBusy(true)
    try { await api('/auth/password/reset', { method: 'POST', body: jsonBody({ token, password: resetPassword }) }); setPassword(resetPassword); await refreshOutbox(); show('Synthetic test password reset; previous sessions were revoked.', 'success') }
    catch (err) { show(errorText(err), 'error') }
    finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true)
    try { await api('/auth/logout', { method: 'POST', body: '{}' }); await refresh(); show('Signed out of the synthetic test account.', 'success') }
    catch (err) { show(errorText(err), 'error') }
    finally { setBusy(false) }
  }
  async function forgotPassword() {
    if (!email) return show('Enter a synthetic test email address first.', 'error')
    setBusy(true)
    try { await api('/auth/password/forgot', { method: 'POST', body: jsonBody({ email }) }); await refreshOutbox(); show('If that synthetic account exists, a local reset message is available below.', 'success') }
    catch (err) { show(errorText(err), 'error') }
    finally { setBusy(false) }
  }
  return <section className="test-content-width test-account-page">
    {user ? <div className="test-session-card"><div><span className="test-eyebrow">ACTIVE SYNTHETIC SESSION</span><h2>{user.displayName}</h2><p>{user.email} · {user.emailVerified ? 'verified' : 'not verified'}</p></div><div className="test-action-row"><Link className="test-button test-button-primary" to="/test/workspace">Open founder workspace</Link><button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => void logout()}>Sign out</button></div></div> : <div className="test-account-layout">
      <aside className="test-account-story">
        <div className="test-account-story-copy">
          <span className="test-eyebrow">A COMMUNITY FOR MAKERS AND SUPPORTERS</span>
          <h1>{mode === 'register' ? 'Join the Aarambh community' : 'Welcome back'}</h1>
          <p>{mode === 'register' ? 'Meet the people behind thoughtful Indian brands, share what you are building, and find your next source of inspiration.' : 'Sign in to find independent makers, follow the stories you love, and keep up with what is taking shape around you.'}</p>
          <div className="test-account-story-points"><div><strong>Discover</strong><span>Ideas rooted in craft and community.</span></div><div><strong>Connect</strong><span>Meet the makers shaping what comes next.</span></div></div>
        </div>
        <div className="test-account-art"><img src="/images/aarambh-home-hero.jpg" alt="" /><span>Rooted in craft. Made by India.</span></div>
      </aside>
      <div className="test-account-access">
        <span className="test-eyebrow">AARAMBH COMMUNITY</span>
        <h2>{mode === 'register' ? 'Create your account' : 'Sign in to Aarambh'}</h2>
        <p>{mode === 'register' ? 'Start with a fictional profile for this interactive preview.' : 'Welcome back. Continue with your synthetic test account.'}</p>
        <form className="test-form-card" onSubmit={event => void submit(event)}>
          <div className="test-form-tabs"><button type="button" aria-pressed={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button><button type="button" aria-pressed={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register synthetic account</button></div>
          {mode === 'register' && <label className="test-field"><span>Fictional display name</span><input required maxLength={80} value={displayName} onChange={event => setDisplayName(event.target.value)} /></label>}
          <label className="test-field"><span>Synthetic email address</span><input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@synthetic.example.invalid" /></label>
          <label className="test-field"><span>{mode === 'register' ? 'New synthetic password (12+ characters)' : 'Synthetic test password'}</span><input required type="password" minLength={mode === 'register' ? 12 : 1} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <button className="test-button test-button-primary" type="submit" disabled={busy || loading}>{busy ? 'Working…' : mode === 'register' ? 'Create synthetic account' : 'Sign in'}</button>
          {mode === 'login' && <button className="test-text-button" type="button" disabled={busy} onClick={() => void forgotPassword()}>Create a local password-reset message</button>}
          <p className="test-muted">Use only a fictional address ending in <code>.invalid</code>. Never enter a real email or password in this preview.</p>
        </form>
        <details className="test-seed-accounts"><summary><span className="test-eyebrow">SEEDED SYNTHETIC ACCOUNTS</span><strong>Quick sign-in for QA</strong></summary>
          <div className="test-seed-account-options"><h3>Choose a fictional account</h3>
            <button type="button" className="test-seed-choice" onClick={() => { setEmail('founder@synthetic.example.invalid'); setPassword('TestFounder_2026!'); setMode('login') }}><strong>Founder account</strong><span>founder@synthetic.example.invalid</span><code>TestFounder_2026!</code></button>
            <button type="button" className="test-seed-choice" onClick={() => { setEmail('member@synthetic.example.invalid'); setPassword('TestMember_2026!'); setMode('login') }}><strong>Member account</strong><span>member@synthetic.example.invalid</span><code>TestMember_2026!</code></button>
            <p>The founder account owns the seeded brand; use the member account to like/save those launches.</p>
          </div>
        </details>
      </div>
    </div>}
    {notice && <Notice kind={noticeKind}>{notice}</Notice>}
    <details className="test-outbox" open={outboxExpanded}>
      <summary className="test-outbox-summary"><span className="test-eyebrow">MEMORY-ONLY · TEST PREVIEW</span><strong>Local verification / reset messages</strong><span>No SMTP or email provider is used.</span></summary>
      <div className="test-outbox-content"><div className="test-section-heading"><div><span className="test-eyebrow">SYNTHETIC ACCOUNT TOOLS</span><h2>Messages stay inside this preview</h2></div><button className="test-button test-button-secondary" type="button" onClick={() => void refreshOutbox()}>Refresh</button></div>
        <p>No mail is sent or stored. One-time links remain inside this disposable test session.</p>
        {outbox.length ? outbox.slice().reverse().map((message, index) => {
          const isVerify = message.verificationUrl?.includes('/verify-email')
          const isReset = message.verificationUrl?.includes('/reset-password')
          return <div className="test-outbox-message" key={`${message.createdAt}-${index}`}><div><strong>{message.subject}</strong><span>To fictional address: {message.to}</span></div>
            {isVerify && <button className="test-button test-button-secondary" type="button" disabled={busy} onClick={() => void verify(message.verificationUrl)}>Consume local verification link</button>}
            {isReset && <div className="test-reset-row"><input aria-label="New synthetic reset password" type="password" minLength={12} placeholder="New synthetic password (12+ chars)" value={resetPassword} onChange={event => setResetPassword(event.target.value)} /><button className="test-button test-button-secondary" type="button" disabled={busy} onClick={() => void resetFromMessage(message.verificationUrl)}>Use local reset link</button></div>}
          </div>
        }) : <Notice>No synthetic messages yet. Register or request a reset to exercise the local outbox.</Notice>}
      </div>
    </details>
    <button className="test-text-button" type="button" onClick={() => navigate('/test')}>Return to synthetic browse</button>
  </section>
}

type BrandOwner = ApiBrand & { status: string; category: string }
type LaunchOwner = { id: string; title: string; status: string; slug: string; category?: string; summary?: string; story?: string; moderationLocked?: boolean; publishedAt?: string; createdAt?: string; updatedAt?: string }

function initialWorkspaceBrandId(items: BrandOwner[]) {
  return items.find(brand => brand.status === 'published')?.id || items[0]?.id || ''
}

function launchActivity(launch: LaunchOwner) {
  const dates = [
    { label: 'Updated', value: launch.updatedAt },
    { label: 'Published', value: launch.publishedAt },
    { label: 'Created', value: launch.createdAt }
  ]
  let latest: { label: string; value: string; timestamp: number } | undefined
  for (const date of dates) {
    const value = date.value
    if (!value) continue
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp) && (!latest || timestamp > latest.timestamp)) latest = { label: date.label, value, timestamp }
  }
  return latest
}

function formatWorkspaceDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function WorkspacePage() {
  const { user, loading } = useTestSession()
  const [profile, setProfile] = useState<{ id: string; displayName: string } | null>(null)
  const [brands, setBrands] = useState<BrandOwner[]>([])
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [launches, setLaunches] = useState<LaunchOwner[]>([])
  const [launchesLoadedForBrand, setLaunchesLoadedForBrand] = useState('')
  const [launchesError, setLaunchesError] = useState('')
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [brandName, setBrandName] = useState('A Sample Studio')
  const [brandCategory, setBrandCategory] = useState('technology-software')
  const [launchTitle, setLaunchTitle] = useState('A new synthetic launch')
  const [launchCategory, setLaunchCategory] = useState('technology-software')
  const [launchAtLocal, setLaunchAtLocal] = useState('')
  const [endsAtLocal, setEndsAtLocal] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeKind, setNoticeKind] = useState<'success' | 'error' | 'info'>('info')
  const [busy, setBusy] = useState(false)
  const [logoUrl, setLogoUrl] = useState('')
  const [launchImageUrl, setLaunchImageUrl] = useState('')
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productBuyUrl, setProductBuyUrl] = useState('')
  const [productImageUrl, setProductImageUrl] = useState('')
  const [editingProduct, setEditingProduct] = useState<ApiProduct | null>(null)
  const [editingLaunchId, setEditingLaunchId] = useState('')
  const [editingLaunchTitle, setEditingLaunchTitle] = useState('')
  const [editingLaunchCategory, setEditingLaunchCategory] = useState('')
  const [editingLaunchSummary, setEditingLaunchSummary] = useState('')
  const [editingLaunchStory, setEditingLaunchStory] = useState('')

  const reload = useCallback(async () => {
    try {
      const [profileResult, brandResult] = await Promise.all([
        api<{ item: { id: string; displayName: string } | null }>('/me/founder-profile'),
        api<{ items: BrandOwner[] }>('/me/brands')
      ])
      setProfile(profileResult.item)
      setBrands(brandResult.items)
      const next = selectedBrand || initialWorkspaceBrandId(brandResult.items)
      setSelectedBrand(next)
    } catch (err) { setNotice(errorText(err)); setNoticeKind('error') }
  }, [selectedBrand])
  const userId = user?.id
  const [productsForBrand, setProductsForBrand] = useState('')
  const visibleProducts = productsForBrand === selectedBrand ? products : []
  const launchesLoading = Boolean(selectedBrand && launchesLoadedForBrand !== selectedBrand)
  const selectedBrandRecord = brands.find(brand => brand.id === selectedBrand)
  const recentLaunches = [...launches].sort((first, second) => (launchActivity(second)?.timestamp ?? 0) - (launchActivity(first)?.timestamp ?? 0)).slice(0, 3)
  useEffect(() => {
    if (!userId) return
    let active = true
    void Promise.all([
      api<{ item: { id: string; displayName: string } | null }>('/me/founder-profile'),
      api<{ items: BrandOwner[] }>('/me/brands')
    ]).then(([profileResult, brandResult]) => {
      if (!active) return
      setProfile(profileResult.item)
      setBrands(brandResult.items)
      setSelectedBrand(current => current && brandResult.items.some(item => item.id === current) ? current : initialWorkspaceBrandId(brandResult.items))
    }).catch(err => { if (active) { setNotice(errorText(err)); setNoticeKind('error') } })
    return () => { active = false }
  }, [userId])
  useEffect(() => { void api<{ categories: ApiCategory[] }>('/categories').then(result => { setCategories(result.categories); if (result.categories[0]) { setBrandCategory(result.categories[0].id); setLaunchCategory(result.categories[0].id) } }).catch(err => { setNotice(errorText(err)); setNoticeKind('error') }) }, [])
  useEffect(() => {
    let active = true
    if (!userId || !selectedBrand) return () => { active = false }
    void api<{ items: LaunchOwner[] }>(`/me/brands/${selectedBrand}/launches`)
      .then(result => { if (active) { setLaunches(result.items); setLaunchesError(''); setLaunchesLoadedForBrand(selectedBrand) } })
      .catch(err => { if (active) { setLaunchesError(errorText(err)); setLaunchesLoadedForBrand(selectedBrand) } })
    return () => { active = false }
  }, [selectedBrand, userId])
  useEffect(() => {
    if (!userId || !selectedBrand) return
    let active = true
    void api<{ items: ApiProduct[] }>(`/me/brands/${encodeURIComponent(selectedBrand)}/products`)
      .then(result => { if (active) { setProducts(result.items); setProductsForBrand(selectedBrand) } })
      .catch(err => { if (active) { setProducts([]); setProductsForBrand(''); setNotice(errorText(err)); setNoticeKind('error') } })
    return () => { active = false }
  }, [selectedBrand, userId])
  function show(message: string, kind: 'success' | 'error' = 'success') { setNotice(message); setNoticeKind(kind) }
  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice('')
    try { await action() } catch (err) { show(errorText(err), 'error') }
    finally { setBusy(false) }
  }
  if (loading) return <section className="test-content-width"><Notice>Checking the synthetic session…</Notice></section>
  if (!user) return <section className="test-content-width"><TestPageHeading eyebrow="FOUNDER WORKSPACE" title="Sign in to test authoring" description="Founder profiles, brand drafts, launches, and publishing use only the disposable test database." /><Notice><Link to="/test/account">Open the synthetic account screen</Link> and sign in with the seeded founder account.</Notice></section>
  const createProfile = () => run(async () => {
    await api('/me/founder-profile', { method: 'POST', body: jsonBody({ displayName: user.displayName, bio: 'A fictional founder profile created in the isolated test preview.', city: 'Jaipur', state: 'Rajasthan', role: 'Synthetic founder', publicProfile: true }) })
    await reload(); show('Synthetic founder profile created.')
  })
  const addBrand = () => run(async () => {
    const result = await api<{ item: BrandOwner }>('/me/brands', { method: 'POST', body: jsonBody({ brand: {
      name: brandName, description: `${brandName} is a fictional test brand, created only for the disposable local preview.`,
      category: brandCategory, logoUrl: logoUrl || undefined, websiteUrl: 'https://sample-brand.invalid',
      tagline: 'Synthetic records only', city: 'Jaipur', state: 'Rajasthan'
    } }) })
    setSelectedBrand(result.item.id); await reload(); show(`Draft brand “${result.item.name}” created.`)
  })
  const publishBrand = (brand: BrandOwner) => run(async () => {
    await api(`/me/brands/${brand.id}/publish`, { method: 'POST', body: '{}' }); await reload(); show(`Synthetic brand “${brand.name}” published locally.`)
  })
  const createLaunch = () => run(async () => {
    if (!selectedBrand) throw new Error('Create or select a synthetic brand first.')
    if (!launchImageUrl) throw new Error('Attach the built-in synthetic launch image first.')
    const toIstIso = (value: string) => value ? new Date(`${value}:00+05:30`).toISOString() : undefined
    const result = await api<{ item: LaunchOwner }>(`/me/brands/${selectedBrand}/launches`, { method: 'POST', body: jsonBody({ status: 'draft', launch: {
      title: launchTitle, launchType: 'product', category: launchCategory,
      launchDate: launchAtLocal ? launchAtLocal.slice(0, 10) : undefined, launchAt: toIstIso(launchAtLocal), endsAt: toIstIso(endsAtLocal),
      summary: 'A fictional launch created to exercise the synthetic API.',
      story: 'This launch and its business are synthetic sample content stored only in the disposable test database.',
      images: [{ url: launchImageUrl, altText: `Synthetic sample image for ${launchTitle}` }],
      founderIds: profile ? [profile.id] : undefined, brandId: selectedBrand
    } }) })
    await loadLaunches(); show(`Draft launch “${result.item.title}” created.`)
  })
  async function loadLaunches() {
    if (!selectedBrand) return
    const result = await api<{ items: LaunchOwner[] }>(`/me/brands/${selectedBrand}/launches`)
    setLaunches(result.items); setLaunchesError(''); setLaunchesLoadedForBrand(selectedBrand)
  }
  async function loadProducts() {
    if (!selectedBrand) return
    const result = await api<{ items: ApiProduct[] }>(`/me/brands/${encodeURIComponent(selectedBrand)}/products`)
    setProducts(result.items); setProductsForBrand(selectedBrand)
  }
  const addProduct = () => run(async () => {
    if (!selectedBrand) throw new Error('Choose one of your synthetic brands first.')
    const parsedPrice = productPrice.trim() ? Number(productPrice) : null
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) throw new Error('Enter a non-negative price or leave the price blank.')
    const priceInrPaise = parsedPrice === null ? undefined : Math.round(parsedPrice * 100)
    const product = { name: productName, description: productDescription,
      ...(editingProduct ? { priceInrPaise: priceInrPaise ?? null } : priceInrPaise !== undefined ? { priceInrPaise } : {}),
      imageUrl: productImageUrl || undefined, buyUrl: productBuyUrl }
    if (editingProduct) await api(`/me/brands/${encodeURIComponent(selectedBrand)}/products/${encodeURIComponent(editingProduct.id)}`, { method: 'PATCH', body: jsonBody({ product }) })
    else await api(`/me/brands/${encodeURIComponent(selectedBrand)}/products`, { method: 'POST', body: jsonBody({ product }) })
    await loadProducts()
    setProductName(''); setProductDescription(''); setProductPrice(''); setProductBuyUrl(''); setProductImageUrl('')
    setEditingProduct(null)
    show(editingProduct ? 'Product changes saved.' : 'Product added to the selected business.')
  })
  const removeProduct = (product: ApiProduct) => run(async () => {
    await api(`/me/brands/${encodeURIComponent(selectedBrand)}/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' })
    await loadProducts(); if (editingProduct?.id === product.id) { setEditingProduct(null); setProductName(''); setProductDescription(''); setProductPrice(''); setProductBuyUrl(''); setProductImageUrl('') } show(`Product “${product.name}” removed.`)
  })
  function selectProduct(product: ApiProduct) { setEditingProduct(product); setProductName(product.name); setProductDescription(product.description); setProductPrice(product.priceInrPaise == null ? '' : String(product.priceInrPaise / 100)); setProductBuyUrl(product.buyUrl); setProductImageUrl(product.imageUrl || '') }
  function selectProductImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    if (!file) return
    void run(async () => {
      const asset = await uploadProductFile(file)
      setProductImageUrl(asset.url)
      show('Product image uploaded to temporary preview storage.')
    })
  }
  const publishLaunch = (launch: LaunchOwner) => run(async () => {
    await api(`/me/launches/${launch.id}/publish`, { method: 'POST', body: '{}' }); await loadLaunches(); show(`Synthetic launch “${launch.title}” published locally.`)
  })
  function editLaunch(launch: LaunchOwner) {
    setEditingLaunchId(launch.id)
    setEditingLaunchTitle(launch.title)
    setEditingLaunchCategory(launch.category || '')
    setEditingLaunchSummary(launch.summary || '')
    setEditingLaunchStory(launch.story || '')
  }
  const saveLaunch = (launch: LaunchOwner) => run(async () => {
    await api(`/me/launches/${encodeURIComponent(launch.id)}`, { method: 'PATCH', body: jsonBody({ launch: {
      title: editingLaunchTitle.trim(), category: editingLaunchCategory,
      summary: editingLaunchSummary.trim(), story: editingLaunchStory.trim()
    } }) })
    await loadLaunches()
    setEditingLaunchId('')
    show(`Synthetic launch draft “${editingLaunchTitle.trim()}” updated.`)
  })
  const pauseLaunch = (launch: LaunchOwner) => run(async () => {
    await api(`/me/launches/${encodeURIComponent(launch.id)}/pause`, { method: 'POST', body: '{}' })
    await loadLaunches(); show(`Synthetic launch “${launch.title}” paused.`)
  })
  const resumeLaunch = (launch: LaunchOwner) => run(async () => {
    await api(`/me/launches/${encodeURIComponent(launch.id)}/publish`, { method: 'POST', body: '{}' })
    await loadLaunches(); show(`Synthetic launch “${launch.title}” resumed.`)
  })
  const archiveLaunch = (launch: LaunchOwner) => run(async () => {
    await api(`/me/launches/${encodeURIComponent(launch.id)}/archive`, { method: 'POST', body: '{}' })
    await loadLaunches(); setEditingLaunchId(''); show(`Synthetic launch “${launch.title}” archived.`)
  })
  return <section className="test-content-width test-workspace-page">
    <section className="test-workspace-welcome" aria-labelledby="test-workspace-welcome-title">
      <div className="test-workspace-welcome-main">
        <span className="test-workspace-welcome-eyebrow">YOUR PRIVATE FOUNDER HOME</span>
        <h1 id="test-workspace-welcome-title">Welcome back, {user.displayName}</h1>
        <p>Your home base for shaping a good idea, building your business, and sharing what’s next.</p>
        <div className="test-workspace-welcome-actions"><a className="test-button test-button-primary" href="#workspace-launches">Create a launch <ArrowUpRight size={15} aria-hidden="true" /></a><Link className="test-workspace-dashboard-link" to="/test/dashboard">View founder dashboard <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        <span className="test-workspace-synthetic-note">Synthetic preview · Changes stay in this disposable session.</span>
      </div>
      <dl className="test-workspace-welcome-stats" aria-label="Workspace snapshot">
        <div><dt>Your brands</dt><dd>{brands.length}</dd><small>{brands.filter(brand => brand.status === 'published').length} published</small></div>
        <div><dt>Founder profile</dt><dd>{profile ? 'Ready' : 'Set up'}</dd><small>{profile ? 'Attached to new launches' : 'One quick step to get started'}</small></div>
      </dl>
    </section>
    <div className="test-workspace-overview">
      <section className="test-workspace-overview-panel test-workspace-shortcuts" aria-labelledby="test-workspace-shortcuts-title">
        <div className="test-workspace-panel-heading"><span className="test-eyebrow">A GOOD PLACE TO START</span><h2 id="test-workspace-shortcuts-title">Your shortcuts</h2><p>Pick up where you left off or take the next step.</p></div>
        <div className="test-workspace-shortcut-groups">
          <div className="test-workspace-shortcut-group"><span>01 · CREATE</span><a href="#workspace-launches">Start a launch <ArrowUpRight size={14} aria-hidden="true" /></a><p>Draft and publish your next update.</p></div>
          <div className="test-workspace-shortcut-group"><span>02 · BUILD</span><a href="#workspace-brands">Manage your brands <ArrowUpRight size={14} aria-hidden="true" /></a><p>Shape your business presence and catalog.</p></div>
          <div className="test-workspace-shortcut-group"><span>03 · GROW</span><Link to="/test/founder-profile">Update founder profile <ArrowUpRight size={14} aria-hidden="true" /></Link><p>Help the community get to know you.</p></div>
          <div className="test-workspace-shortcut-group"><span>04 · STAY IN THE LOOP</span><Link to="/test/notifications">Open notifications <ArrowUpRight size={14} aria-hidden="true" /></Link><p>See what’s happening around your launches.</p></div>
        </div>
        <div className="test-workspace-shortcut-footer"><Link to="/test/business-profile">Business contact & location</Link><Link to="/test/dashboard">Founder analytics</Link></div>
      </section>
      <section className="test-workspace-overview-panel test-workspace-recent" aria-labelledby="test-workspace-recent-title" data-testid="workspace-recent-launches">
        <div className="test-workspace-panel-heading test-workspace-recent-heading"><div><span className="test-eyebrow">LATEST ACTIVITY</span><h2 id="test-workspace-recent-title">Recent launches</h2></div><span className="test-workspace-brand-label">{selectedBrandRecord?.name ?? 'Your workspace'}</span></div>
        {launchesLoading ? <p className="test-workspace-recent-message" aria-live="polite">Loading recent activity…</p> : launchesError && launchesLoadedForBrand === selectedBrand ? <Notice kind="error">{launchesError}</Notice> : !selectedBrand ? <p className="test-workspace-recent-message">Create a brand first, then your launch activity will appear here. <a href="#workspace-brands">Create a brand</a></p> : recentLaunches.length ? <ul className="test-workspace-recent-list">{recentLaunches.map(launch => {
          const activity = launchActivity(launch)
          return <li key={launch.id} className="test-workspace-recent-item">
            <div className="test-workspace-recent-meta"><span className={`test-workspace-launch-status is-${launch.status}`}>{launch.status}</span>{activity ? <time dateTime={activity.value}>{activity.label} {formatWorkspaceDate(activity.value)}</time> : <span>Recent activity</span>}</div>
            {launch.status === 'published' ? <Link className="test-workspace-recent-title" to={`/test/launch/${launch.slug}`}>{launch.title}</Link> : <strong className="test-workspace-recent-title">{launch.title}</strong>}
          </li>
        })}</ul> : <p className="test-workspace-recent-message">No launches for this brand yet. Start with a draft when you’re ready.</p>}
        <a className="test-workspace-see-all" href="#workspace-launches">See all launches <ArrowUpRight size={14} aria-hidden="true" /></a>
      </section>
    </div>
    {notice && <Notice kind={noticeKind}>{notice}</Notice>}
    <div className="test-workspace-management">
      <div className="test-workspace-management-heading"><span className="test-eyebrow">YOUR WORKSPACE</span><h2>Build and manage</h2><p>Keep your founder profile, business, launches, and products up to date.</p></div>
    {!profile ? <article className="test-workspace-card"><div className="test-section-heading"><h2>Founder profile</h2><span>Required before launch publishing</span></div><p>Create a fictional profile for {user.displayName}.</p><button className="test-button test-button-primary" disabled={busy} onClick={createProfile}>Create synthetic founder profile</button></article> : <article className="test-workspace-card"><div className="test-section-heading"><h2>Founder profile ready</h2><span>{profile.displayName}</span></div><p>This sample profile is attached to new launches you create.</p></article>}
    <article id="workspace-brands" className="test-workspace-card"><div className="test-section-heading"><h2>Brands</h2><span>{brands.length} synthetic records</span></div>
      <div className="test-owned-list">{brands.map(brand => <div className="test-owned-row" key={brand.id}><div><strong>{brand.name}</strong><span>{brand.status} · {brand.category}</span></div>{brand.status === 'draft' && <button className="test-button test-button-secondary" disabled={busy} onClick={() => void publishBrand(brand)}>Publish synthetic brand</button>}</div>)}</div>
      <div className="test-form-grid"><label className="test-field"><span>New fictional brand name</span><input value={brandName} maxLength={100} onChange={event => setBrandName(event.target.value)} /></label>
        <label className="test-field"><span>Category</span><select value={brandCategory} onChange={event => setBrandCategory(event.target.value)}>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <div className="test-action-row"><button className="test-button test-button-secondary" disabled={busy} onClick={() => void run(async () => { const asset = await uploadFixture('brand-logo'); setLogoUrl(asset.url); show('Synthetic sample brand image uploaded to temporary storage.') })}>{logoUrl ? 'Replace sample logo' : 'Attach built-in synthetic logo'}</button><button className="test-button test-button-primary" disabled={busy || !brandName.trim()} onClick={() => void addBrand()}>Create draft brand</button></div>
      <p className="test-muted">Publishing uses the reserved <code>.invalid</code> destination, which is not linked or opened.</p>
    </article>
    <article id="workspace-launches" className="test-workspace-card"><div className="test-section-heading"><h2>Launches and drafts</h2><span>Edit drafts, publish, pause, resume, or archive your synthetic launches</span></div>
      <label className="test-field"><span>Brand</span><select value={selectedBrand} onChange={event => setSelectedBrand(event.target.value)}><option value="">Choose a brand</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name} · {brand.status}</option>)}</select></label>
      {brands.find(brand => brand.id === selectedBrand)?.status !== 'published' && selectedBrand && <Notice>Publish this brand before publishing a launch.</Notice>}
      <div className="test-form-grid"><label className="test-field"><span>Fictional launch title</span><input value={launchTitle} maxLength={120} onChange={event => setLaunchTitle(event.target.value)} /></label><label className="test-field"><span>Category</span><select value={launchCategory} onChange={event => setLaunchCategory(event.target.value)}>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="test-field"><span>Scheduled start (India time, optional)</span><input type="datetime-local" value={launchAtLocal} onChange={event => setLaunchAtLocal(event.target.value)} /></label><label className="test-field"><span>Launch ending (India time, optional)</span><input type="datetime-local" value={endsAtLocal} onChange={event => setEndsAtLocal(event.target.value)} /></label></div><p className="test-muted">Scheduled launches use Asia/Kolkata; optional end time triggers an in-app reminder within 48 hours.</p>
      <div className="test-action-row"><button className="test-button test-button-secondary" disabled={busy} onClick={() => void run(async () => { const asset = await uploadFixture('launch-carousel'); setLaunchImageUrl(asset.url); show('Synthetic sample launch image uploaded to temporary storage.') })}>{launchImageUrl ? 'Replace sample image' : 'Attach built-in synthetic launch image'}</button><button className="test-button test-button-primary" disabled={busy || !selectedBrand || !launchTitle.trim()} onClick={() => void createLaunch()}>Create launch draft</button></div>
      {launchesLoading ? <Notice>Loading launches for this brand…</Notice> : launchesError && launchesLoadedForBrand === selectedBrand ? <Notice kind="error">{launchesError}</Notice> : !selectedBrand ? <Notice>Choose a brand above to load its launches.</Notice> : launches.length ? <div className="test-launch-manager-list">{launches.map(launch => {
        const locked = Boolean(launch.moderationLocked) || launch.status === 'removed'
        const isEditing = editingLaunchId === launch.id
        return <div className="test-launch-manager-item" key={launch.id} data-launch-id={launch.id}>
          <div className="test-owned-row"><div><strong>{launch.title}</strong><span>{launch.status}{launch.status === 'published' && <> · <Link to={`/test/launch/${launch.slug}`}>open public detail</Link></>}</span></div>
            <div className="test-action-row">
              {launch.status === 'draft' && !locked && <button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => editLaunch(launch)}>Edit draft</button>}
              {launch.status === 'draft' && !locked && <button type="button" className="test-button test-button-secondary" disabled={busy || brands.find(brand => brand.id === selectedBrand)?.status !== 'published'} onClick={() => void publishLaunch(launch)}>Publish synthetic launch</button>}
              {launch.status === 'published' && !locked && <button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => void pauseLaunch(launch)}>Pause launch</button>}
              {launch.status === 'paused' && !locked && <button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => void resumeLaunch(launch)}>Resume launch</button>}
              {launch.status !== 'archived' && !locked && <button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => void archiveLaunch(launch)}>Archive launch</button>}
              {locked && <span className="test-muted">Moderator review required</span>}
            </div>
          </div>
          {isEditing && !locked && <form className="test-form-grid test-launch-edit-form" onSubmit={event => { event.preventDefault(); void saveLaunch(launch) }}>
            <label className="test-field"><span>Launch title</span><input aria-label="Edit launch title" required maxLength={120} value={editingLaunchTitle} onChange={event => setEditingLaunchTitle(event.target.value)} /></label>
            <label className="test-field"><span>Category</span><select aria-label="Edit launch category" required value={editingLaunchCategory} onChange={event => setEditingLaunchCategory(event.target.value)}>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="test-field"><span>Summary</span><textarea aria-label="Edit launch summary" required maxLength={500} rows={2} value={editingLaunchSummary} onChange={event => setEditingLaunchSummary(event.target.value)} /></label>
            <label className="test-field"><span>Story</span><textarea aria-label="Edit launch story" required maxLength={5000} rows={3} value={editingLaunchStory} onChange={event => setEditingLaunchStory(event.target.value)} /></label>
            <div className="test-action-row"><button type="submit" className="test-button test-button-primary" disabled={busy || !editingLaunchTitle.trim() || !editingLaunchSummary.trim() || !editingLaunchStory.trim()}>Save launch draft</button><button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => setEditingLaunchId('')}>Cancel edit</button></div>
          </form>}
        </div>
      })}</div> : <Notice>No launch records for this synthetic brand yet.</Notice>}
    </article>
    <article id="test-products-section" className="test-workspace-card test-product-manager">
      <div className="test-section-heading"><div><span className="test-eyebrow">OWNER-MANAGED · DATABASE CATALOG</span><h2>Products sold by your business</h2></div><span>{visibleProducts.length} products</span></div>
      <label className="test-field"><span>Manage products for</span><select value={selectedBrand} onChange={event => setSelectedBrand(event.target.value)}><option value="">Choose one of your brands</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name} · {brand.status}</option>)}</select></label>
      {visibleProducts.length ? <div className="test-product-owner-list">{visibleProducts.map(product => <div className="test-product-owner-row" key={product.id}>
        {product.imageUrl && <img src={product.imageUrl} alt="" />}
        <div><strong>{product.name}</strong><p>{product.description}</p><span>{product.priceInrPaise === undefined ? 'No price listed' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(product.priceInrPaise / 100)}</span></div>
        <div className="test-action-row"><button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => selectProduct(product)}>Edit</button><button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => void removeProduct(product)}>Remove</button></div>
      </div>)}</div> : <Notice>{selectedBrand ? 'No products for this brand yet. Add a product below.' : 'Choose a brand to manage its products.'}</Notice>}
      <form className="test-product-form" onSubmit={event => { event.preventDefault(); void addProduct() }}>
        <label className="test-field"><span>Product name</span><input required maxLength={100} value={productName} onChange={event => setProductName(event.target.value)} placeholder="Fictional sample product" /></label>
        <label className="test-field"><span>Short description</span><textarea required maxLength={240} rows={2} value={productDescription} onChange={event => setProductDescription(event.target.value)} placeholder="A concise product description" /></label>
        <div className="test-form-grid">
          <label className="test-field"><span>Price (optional, INR)</span><input type="number" min="0" max="1000000000" step="0.01" inputMode="decimal" value={productPrice} onChange={event => setProductPrice(event.target.value)} placeholder="Leave blank to omit" /></label>
          <label className="test-field"><span>Official buy link (HTTPS)</span><input required type="url" pattern="https://.+" title="Enter a valid HTTPS product link." maxLength={2048} value={productBuyUrl} onChange={event => setProductBuyUrl(event.target.value)} placeholder="https://your-business.invalid/product" /></label>
        </div>
        <label className="test-field"><span>Product image (optional, JPEG/PNG/WebP)</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectProductImage} /></label>
        {productImageUrl && <div className="test-product-image-preview"><img src={productImageUrl} alt="Synthetic product preview" /><button type="button" className="test-text-button" onClick={() => setProductImageUrl('')}>Remove selected image</button></div>}
        <div className="test-action-row"><button type="submit" className="test-button test-button-primary" disabled={busy || !selectedBrand}>{editingProduct ? 'Save product changes' : 'Add product'}</button>{editingProduct && <button type="button" className="test-button test-button-secondary" disabled={busy} onClick={() => { setEditingProduct(null); setProductName(''); setProductDescription(''); setProductPrice(''); setProductBuyUrl(''); setProductImageUrl('') }}>Cancel edit</button>}
          {brands.find(brand => brand.id === selectedBrand)?.status === 'published' && <Link className="test-inline-link" to={`/test/brand/${brands.find(brand => brand.id === selectedBrand)?.slug}`}>View public brand page</Link>}
        </div>
      </form>
      <p className="test-muted">Product cards link directly to the business’s HTTPS destination. There is no cart, checkout, order processing, or payment handling. This synthetic preview resets its in-memory database and temporary uploads when stopped.</p>
    </article>
    </div>
  </section>
}

function TestRouter() {
  const { pathname } = useLocation()
  const { user } = useTestSession()
  if (pathname === '/test' || pathname === '/test/') return <AarambhHomepage />
  if (pathname === '/test/account') return <AccountPage />
  if (pathname === '/test/workspace') return <WorkspacePage />
  if (pathname === '/test/leaderboard') return <LeaderboardPage />
  if (pathname === '/test/nearby') return <BusinessDiscoveryPage user={user} />
  if (pathname === '/test/saved-businesses') return <SavedBusinessesPage user={user} />
  if (pathname === '/test/following') return <FollowingPage user={user} />
  if (pathname === '/test/for-you') return <ForYouPage />
  if (pathname === '/test/collections') return <CollectionsPage user={user} />
  if (pathname === '/test/upcoming') return <UpcomingPage />
  if (pathname === '/test/trending') return <TrendingPage />
  if (pathname === '/test/dashboard' || pathname === '/test/analytics') return <FounderDashboardPage user={user} />
  if (pathname === '/test/notifications') return <NotificationsPage user={user} />
  if (pathname === '/test/samples/community') return <CommunityProfilePage embedded user={user} />
  if (pathname === '/test/samples/launch-calendar') return <LaunchLifecyclePage />
  if (pathname === '/test/samples/analytics') return <GrowthAnalyticsPage />
  if (pathname === '/test/samples/trending') return <GrowthTrendingPage />
  if (pathname === '/test/samples/notifications') return <GrowthNotificationsPage />
  if (pathname === '/test/business-profile') return <BusinessProfileEditorPage user={user} />
  if (pathname === '/test/founder-profile') return <FounderProfileEditorPage user={user} />
  const collection = pathname.match(/^\/test\/collection\/([^/]+)$/u)
  if (collection) return <CollectionSharePage token={decodeURIComponent(collection[1])} />
  const launch = pathname.match(/^\/test\/launch\/([^/]+)$/u)
  if (launch) return <LaunchPage slug={decodeURIComponent(launch[1])} />
  const founder = pathname.match(/^\/test\/founder\/([^/]+)$/u)
  if (founder) return <SyntheticFounderPage slug={decodeURIComponent(founder[1])} user={user} />
  const brand = pathname.match(/^\/test\/brand\/([^/]+)$/u)
  if (brand) return <BrandPage slug={decodeURIComponent(brand[1])} />
  return <section className="test-content-width"><TestPageHeading eyebrow="TEST PREVIEW" title="Page not found" /><Link className="test-button test-button-primary" to="/test">Browse synthetic launches</Link></section>
}

export function InteractiveTestMode() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Aarambh — Interactive synthetic test preview'
    return () => { document.title = previousTitle }
  }, [])
  return <SessionProvider><TestShell><TestRouter /></TestShell></SessionProvider>
}
