import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import './for-you.css'
import './collection-visual.css'
import './profile-editor.css'
import './feature-pages-visual.css'
import { parseBusinessGallery, parseFounderInterests, profilePreviewImageUrl, validateProfileImageUrl } from './profile-validation'

type User = { id: string; displayName: string; email: string; emailVerified: boolean }
type Category = { id: string; name: string; slug: string }
type Launch = { id: string; slug: string; title: string; summary?: string; story?: string; category: string; launchType: string; images?: { url: string; altText: string }[]; brand?: { id: string; slug: string; name: string }; location?: { city?: string; area?: string; state?: string }; lifecycleStage?: string; score?: number }
type Business = { id: string; slug: string; name: string; description?: string; tagline?: string; category?: string; city?: string; state?: string; area?: string; address?: string; latitude?: number; longitude?: number; distanceKm?: number; businessMode?: string; openNow?: boolean | null; verified?: boolean; isFollowed?: boolean; saveCount?: number; isSaved?: boolean; launchCount?: number; logoUrl?: string; links: { website?: string; instagram?: string; whatsapp?: string; phone?: string; email?: string; quote?: string; demo?: string; store?: string } }
type Collection = { id: string; name: string; description?: string; isPublic: boolean; shareUrl?: string; launchCount: number; launches: Launch[] }
type Notification = { id: string; kind: string; subject: string; message: string; createdAt: string; readAt?: string | null }
type Dashboard = { range: string; totals: Record<string, number>; series: Array<Record<string, number | string>>; sources: { source: string; count: number }[]; bestLaunch: { title: string; views: number; slug: string } | null; bestProduct: { name: string; clicks: number } | null; websiteConversion: number; launches: { id: string; title: string; views: number; slug: string }[]; brands: { id: string; name: string }[] }
type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
type HourSlot = { open: string; close: string } | 'closed'
type HoursState = Partial<Record<Weekday, HourSlot>>
const weekdays: Array<[Weekday, string]> = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']]
function normalizeHours(value: unknown): HoursState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const normalized: HoursState = {}
  for (const [day] of weekdays) {
    const slot = input[day]
    if (slot === 'closed') normalized[day] = 'closed'
    else if (slot && typeof slot === 'object' && typeof (slot as { open?: unknown }).open === 'string' && typeof (slot as { close?: unknown }).close === 'string') normalized[day] = slot as { open: string; close: string }
  }
  return normalized
}
function OpeningHoursEditor({ value, onChange }: { value: HoursState; onChange: (value: HoursState) => void }) {
  function setSlot(day: Weekday, status: string) {
    const next = { ...value }
    if (status === 'closed') next[day] = 'closed'
    else if (status === 'open') next[day] = typeof value[day] === 'object' ? value[day] : { open: '09:00', close: '17:00' }
    else delete next[day]
    onChange(next)
  }
  function setTime(day: Weekday, field: 'open' | 'close', time: string) {
    const current = value[day]
    if (!current || current === 'closed') return
    onChange({ ...value, [day]: { ...current, [field]: time } })
  }
  return <fieldset className="test-hours-editor"><legend>Opening hours · India time</legend>{weekdays.map(([day, label]) => { const slot = value[day]; const mode = slot === 'closed' ? 'closed' : slot ? 'open' : 'unset'; return <div className="test-hours-row" key={day}><strong>{label}</strong><select aria-label={`${label} opening status`} value={mode} onChange={event => setSlot(day, event.target.value)}><option value="unset">Not set</option><option value="closed">Closed</option><option value="open">Open</option></select>{slot && slot !== 'closed' && <div><label><span>Opens</span><input aria-label={`${label} opens`} type="time" value={slot.open} onChange={event => setTime(day, 'open', event.target.value)} /></label><label><span>Closes</span><input aria-label={`${label} closes`} type="time" value={slot.close} onChange={event => setTime(day, 'close', event.target.value)} /></label></div>}</div>})}</fieldset>
}
type Page<T> = { items: T[]; nextCursor?: string | null }
type ErrorShape = { error?: { message?: string } }
type ForYouItem = Launch & { recommendationReason: string }
type ForYouResponse = { items: ForYouItem[]; nextCursor: string | null; coldStart: boolean; rankingMode: 'personalized' | 'popular_recent' }
type ForYouFilters = { city: string; state: string; category: string }
const EMPTY_FOR_YOU_FILTERS: ForYouFilters = { city: '', state: '', category: '' }

function FeedModeSwitch({ current }: { current: 'for-you' | 'following' }) {
  return <nav className="test-feed-switch" aria-label="Choose feed" data-testid="feed-mode-switch">
    <Link data-testid="feed-mode-for-you" aria-current={current === 'for-you' ? 'page' : undefined} to="/test/for-you">For You</Link>
    <Link data-testid="feed-mode-following" aria-current={current === 'following' ? 'page' : undefined} to="/test/following">Following</Link>
  </nav>
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' })
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({})) as T & ErrorShape
  if (!response.ok) throw new Error(payload.error?.message || `Request failed (${response.status}).`)
  return payload
}
const body = (value: unknown) => JSON.stringify(value)
const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'

function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div className="test-page-heading"><span>{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
}
function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`test-notice ${error ? 'test-notice-error' : ''}`} role="status">{children}</div>
}
function Button({ children, onClick, disabled, primary = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return <button className={`test-button ${primary ? 'test-button-primary' : 'test-button-secondary'}`} type="button" disabled={disabled} onClick={onClick}>{children}</button>
}
function LaunchCard({ item, source = 'search' }: { item: Launch; source?: string }) {
  const launchHref = `/test/launch/${item.slug}?source=${encodeURIComponent(source)}`
  const brandHref = `/test/brand/${item.brand?.slug || ''}?source=${encodeURIComponent(source)}`
  return <article className="test-launch-card test-feature-launch-card">
    <Link to={launchHref} className="test-launch-image" aria-label={`Open ${item.title}`}>
      {item.images?.[0] && <img src={item.images[0].url} alt={item.images[0].altText} loading="lazy" />}
    </Link>
    <div className="test-launch-content">
      <div className="test-chips"><span>{item.category}</span><span>{item.lifecycleStage?.replaceAll('_', ' ') || item.launchType}</span></div>
      <h2><Link to={launchHref}>{item.title}</Link></h2>
      <p>{item.summary || item.story || 'Synthetic launch.'}</p>
      <div className="test-launch-meta"><Link to={brandHref}>{item.brand?.name || 'Business'}</Link><span>{[item.location?.area, item.location?.city, item.location?.state].filter(Boolean).join(', ')}</span></div>
      <Link className="test-inline-link" to={launchHref}>Open launch</Link>
    </div>
  </article>
}

const cityCenters: Record<string, [number, number]> = {
  Ahmedabad: [23.0225, 72.5714], Jaipur: [26.9124, 75.7873], Mumbai: [19.076, 72.8777], Delhi: [28.6139, 77.209], Bengaluru: [12.9716, 77.5946], Pune: [18.5204, 73.8567], Hyderabad: [17.385, 78.4867], Chennai: [13.0827, 80.2707], Kolkata: [22.5726, 88.3639], Surat: [21.1702, 72.8311]
}
type BusinessMapLocation = { business: Business; markerNumber: number; x: number; y: number }
function hasFounderCoordinates(business: Business) {
  return typeof business.latitude === 'number' && Number.isFinite(business.latitude) && business.latitude >= -90 && business.latitude <= 90 && typeof business.longitude === 'number' && Number.isFinite(business.longitude) && business.longitude >= -180 && business.longitude <= 180
}
function businessMapLocations(items: Business[]): BusinessMapLocation[] {
  const located = items.flatMap((business, index) => hasFounderCoordinates(business) ? [{ business, markerNumber: index + 1, latitude: business.latitude!, longitude: business.longitude! }] : [])
  if (!located.length) return []
  const minLatitude = Math.min(...located.map(item => item.latitude))
  const maxLatitude = Math.max(...located.map(item => item.latitude))
  const minLongitude = Math.min(...located.map(item => item.longitude))
  const maxLongitude = Math.max(...located.map(item => item.longitude))
  return located.map(item => ({
    business: item.business,
    markerNumber: item.markerNumber,
    x: minLongitude === maxLongitude ? 50 : 12 + ((item.longitude - minLongitude) / (maxLongitude - minLongitude)) * 76,
    y: minLatitude === maxLatitude ? 50 : 12 + ((maxLatitude - item.latitude) / (maxLatitude - minLatitude)) * 76,
  }))
}
const discoveryBusinessImageFixtures: Record<string, string> = {
  'arts-crafts': '/images/aarambh-home-hero.jpg',
  'food-beverage': '/images/launch-home.jpg',
  'fashion-accessories': '/images/launch-textile.jpg',
  'home-living': '/images/launch-saffron.jpg',
  'health-wellness': '/images/launch-derma.jpg',
  'technology-software': '/images/growth-maker.jpg',
}
function BusinessThumbnail({ business }: { business: Business }) {
  const fallbackSrc = discoveryBusinessImageFixtures[business.category || ''] || '/images/growth-maker.jpg'
  const initialSrc = business.logoUrl?.trim() || fallbackSrc
  const [src, setSrc] = useState(initialSrc)
  const [failed, setFailed] = useState(false)
  useEffect(() => { setSrc(initialSrc); setFailed(false) }, [business.id, initialSrc])
  if (failed) return <span className="test-business-card-thumb-fallback" role="img" aria-label={`Photo unavailable for ${business.name}`}>{business.name.slice(0, 1).toUpperCase()}</span>
  return <span className="test-business-card-thumb"><img src={src} alt={`${business.name} business photo`} loading="lazy" onError={() => { if (src !== fallbackSrc) setSrc(fallbackSrc); else setFailed(true) }} /></span>
}
function contactItems(business: Business) {
  const directionsQuery = business.latitude != null && business.longitude != null ? `${business.latitude},${business.longitude}` : [business.address, business.area, business.city, business.state].filter(Boolean).join(', ')
  const maps = directionsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}` : undefined
  return [
    business.links.website && { label: 'Website', href: business.links.website, event: 'website_click' },
    business.links.whatsapp && { label: 'WhatsApp', href: business.links.whatsapp, event: 'whatsapp_click' },
    business.links.phone && { label: 'Call', href: `tel:${business.links.phone}`, event: 'call_click' },
    business.links.email && { label: 'Email', href: `mailto:${business.links.email}`, event: 'email_click' },
    maps && { label: 'Directions', href: maps, event: 'directions_click' },
    business.links.quote && { label: 'Request a quote', href: business.links.quote, event: 'quote_click' },
    business.links.demo && { label: 'Book a demo', href: business.links.demo, event: 'demo_click' },
    business.links.store && { label: 'Visit store', href: business.links.store, event: 'store_visit_click' },
  ].filter(Boolean) as { label: string; href: string; event: string }[]
}
export function ContactActions({ business, source = 'direct', launchId }: { business: Business; source?: string; launchId?: string }) {
  const items = contactItems(business)
  if (!items.length) return <span className="test-muted">This synthetic business has not added contact links yet.</span>
  return <div className="test-contact-actions">{items.map(item => <a key={item.event} className="test-button test-button-secondary" href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined} referrerPolicy="no-referrer" onClick={() => { void api(`/businesses/${encodeURIComponent(business.id)}/events`, { method: 'POST', body: body({ eventType: item.event, source, launchId }) }).catch(() => {}) }}>{item.label} ↗</a>)}</div>
}
export function FollowBusiness({ business, user, onChange }: { business: Business; user: User | null; onChange: (following: boolean) => void }) {
  const [following, setFollowing] = useState(Boolean(business.isFollowed))
  const [error, setError] = useState('')
  async function toggle() {
    if (!user?.emailVerified) { setError('Sign in with a verified synthetic account to follow businesses.'); return }
    setError('')
    try {
      await api(`/me/follows/brand/${encodeURIComponent(business.id)}`, { method: following ? 'DELETE' : 'PUT', ...(following ? {} : { body: '{}' }) })
      setFollowing(!following); onChange(!following)
    } catch (err) { setError(message(err)) }
  }
  return <div className="test-follow-control"><Button onClick={() => void toggle()}>{following ? 'Following' : 'Follow business'}</Button>{error && <small>{error}</small>}</div>
}

const activeBusinessSaveRequests = new Set<string>()
function BusinessSaveControl({ business, user }: { business: Business; user: User | null }) {
  const [saved, setSaved] = useState(Boolean(business.isSaved))
  const [saveCount, setSaveCount] = useState(business.saveCount ?? 0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeIsError, setNoticeIsError] = useState(false)
  async function toggle() {
    if (!user?.emailVerified) return
    const requestKey = `${user.id}:${business.slug}`
    if (activeBusinessSaveRequests.has(requestKey)) return
    activeBusinessSaveRequests.add(requestKey)
    setBusy(true)
    setNotice('')
    try {
      const nextSaved = !saved
      const result = await api<{ saved: boolean }>(`/businesses/${encodeURIComponent(business.slug)}/save`, { method: nextSaved ? 'PUT' : 'DELETE' })
      setSaved(result.saved)
      setSaveCount(current => Math.max(0, current + (result.saved ? 1 : -1)))
      setNotice(result.saved ? 'Business saved.' : 'Business removed from saved businesses.')
      setNoticeIsError(false)
    } catch (error) {
      setNotice(message(error))
      setNoticeIsError(true)
    } finally {
      activeBusinessSaveRequests.delete(requestKey)
      setBusy(false)
    }
  }
  return <div className="test-business-save-control" data-testid={`business-save-control-${business.slug}`}>
    {user?.emailVerified
      ? <button type="button" className="test-button test-button-secondary" aria-pressed={saved} onClick={() => void toggle()} disabled={busy}>
          {saved ? 'Remove saved business' : 'Save business'}
        </button>
      : <Link className="test-inline-link" to="/test/account">{user ? 'Verify email to save businesses' : 'Sign in to save businesses'}</Link>}
    <span className="test-muted" data-testid={`business-save-count-${business.slug}`}>{saveCount} {saveCount === 1 ? 'save' : 'saves'}</span>
    <span role="status" data-testid={`business-save-notice-${business.slug}`} className={noticeIsError ? 'test-notice-error' : ''}>{notice}</span>
  </div>
}

export function FollowTarget({ targetType, targetId, label, user, onChange }: { targetType: 'founder' | 'category'; targetId: string; label: string; user: User | null; onChange?: (following: boolean) => void }) {
  const [following, setFollowing] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { if (!user) { setFollowing(false); return } let active = true; void api<{ items: Array<{ targetType: string; targetId: string }> }>('/me/follows').then(result => { if (active) setFollowing(result.items.some(item => item.targetType === targetType && item.targetId === targetId)) }).catch(() => {}); return () => { active = false } }, [user?.id, targetType, targetId])
  async function toggle() { if (!user?.emailVerified) { setNotice('Sign in with a verified synthetic account to follow.'); return } setNotice(''); try { await api(`/me/follows/${targetType}/${encodeURIComponent(targetId)}`, { method: following ? 'DELETE' : 'PUT', ...(following ? {} : { body: '{}' }) }); setFollowing(!following); onChange?.(!following) } catch (err) { setNotice(message(err)) } }
  return <div className="test-follow-control"><Button onClick={() => void toggle()}>{following ? 'Following' : label}</Button>{notice && <small role="status">{notice}</small>}</div>
}

export function BusinessDiscoveryPage({ user }: { user: User | null }) {
  const [searchParams] = useSearchParams()
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Business[]>([])
  const [city, setCity] = useState(() => searchParams.get('city') || 'Ahmedabad')
  const [area, setArea] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState(() => searchParams.get('category') || '')
  const [mode, setMode] = useState('')
  const [sort, setSort] = useState('nearby')
  const [openNow, setOpenNow] = useState(false)
  const [verified, setVerified] = useState(false)
  const [newlyLaunched, setNewlyLaunched] = useState(false)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [useRadius, setUseRadius] = useState(true)
  const [radiusKm, setRadiusKm] = useState('25')
  const [view, setView] = useState<'list' | 'map'>(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 761px)').matches ? 'map' : 'list')
  const [filtersExpanded, setFiltersExpanded] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 601px)').matches)
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mapLocations = useMemo(() => businessMapLocations(items), [items])
  const mapLocationById = useMemo(() => new Map(mapLocations.map(location => [location.business.id, location])), [mapLocations])
  const businessesWithoutCoordinates = useMemo(() => items.filter(business => !hasFounderCoordinates(business)), [items])
  const selectedBusiness = items.find(business => business.id === selectedBusinessId)
  useEffect(() => {
    const desktopFilters = window.matchMedia('(min-width: 601px)')
    const syncDisclosure = (event: MediaQueryListEvent) => setFiltersExpanded(event.matches)
    desktopFilters.addEventListener('change', syncDisclosure)
    return () => desktopFilters.removeEventListener('change', syncDisclosure)
  }, [])
  useEffect(() => { void api<{ categories: Category[] }>('/categories').then(result => setCategories(result.categories)).catch(err => setError(message(err))) }, [])
  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())
    if (city.trim()) params.set('city', city.trim())
    if (area.trim()) params.set('area', area.trim())
    if (category) params.set('category', category)
    if (mode) params.set('mode', mode)
    if (sort) params.set('sort', sort)
    if (openNow) params.set('openNow', 'true')
    if (verified) params.set('verified', 'true')
    if (newlyLaunched) params.set('newlyLaunched', 'true')
    if (priceMin) params.set('priceMin', String(Math.round(Number(priceMin) * 100)))
    if (priceMax) params.set('priceMax', String(Math.round(Number(priceMax) * 100)))
    const center = cityCenters[city.trim()]
    if (useRadius && center) { params.set('latitude', String(center[0])); params.set('longitude', String(center[1])); params.set('radiusKm', radiusKm) }
    try { const result = await api<Page<Business>>(`/discover/businesses?${params.toString()}`); setItems(result.items); setSelectedBusinessId(null); setError('') }
    catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }, [query, city, area, category, mode, sort, openNow, verified, newlyLaunched, priceMin, priceMax, useRadius, radiusKm])
  useEffect(() => { void load() }, [load])
  const selectedCategory = categories.find(item => item.id === category || item.slug === category)
  return <section className="test-content-width test-feature-page">
    <Heading eyebrow="LOCAL DISCOVERY · INDIA" title="Explore makers near you" description={city.trim() ? `Independent makers and small businesses around ${city.trim()}.` : 'Independent makers and small businesses near you.'} />
    <button type="button" className="test-discovery-filter-toggle" aria-label={filtersExpanded ? 'Hide discovery filters' : 'Show discovery filters'} aria-expanded={filtersExpanded} aria-controls="discovery-filter-grid discovery-filter-toggles" onClick={() => setFiltersExpanded(expanded => !expanded)}><span>Filters</span><span className="test-discovery-filter-summary">{city.trim() || 'All India'} · {useRadius ? `${radiusKm} km radius` : 'All distances'}</span><span className="test-discovery-filter-indicator" aria-hidden="true">{filtersExpanded ? '−' : '+'}</span></button>
    <div id="discovery-filter-grid" className={`test-discovery-filters${filtersExpanded ? ' is-expanded' : ''}`}>
      <label className="test-field"><span>Search businesses</span><input aria-label="Search businesses" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cafe, studio, founder…" /></label>
      <label className="test-field"><span>City</span><input aria-label="Filter by city" list="india-cities" value={city} onChange={event => setCity(event.target.value)} placeholder="Ahmedabad" /><datalist id="india-cities">{Object.keys(cityCenters).map(name => <option key={name} value={name} />)}</datalist></label>
      <label className="test-field"><span>Area</span><input aria-label="Filter by area" value={area} onChange={event => setArea(event.target.value)} placeholder="e.g. Navrangpura" /></label>
      <label className="test-field"><span>Category</span><select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{selectedCategory && <FollowTarget targetType="category" targetId={selectedCategory.id} label={`Follow ${selectedCategory.name}`} user={user} />}
      <label className="test-field"><span>Business type</span><select aria-label="Filter by business type" value={mode} onChange={event => setMode(event.target.value)}><option value="">Online or physical</option><option value="online">Online</option><option value="physical">Physical</option><option value="hybrid">Hybrid</option></select></label>
      <label className="test-field"><span>Sort by</span><select aria-label="Sort businesses" value={sort} onChange={event => setSort(event.target.value)}><option value="nearby">Nearest</option><option value="new">Newest business</option><option value="trending">Trending</option><option value="rising">Rising</option><option value="most_saved">Most saved</option><option value="most_liked">Most liked</option></select></label>
      <label className="test-field"><span>Minimum price (₹)</span><input aria-label="Minimum price in rupees" type="number" min="0" step="0.01" value={priceMin} onChange={event => setPriceMin(event.target.value)} /></label>
      <label className="test-field"><span>Maximum price (₹)</span><input aria-label="Maximum price in rupees" type="number" min="0" step="0.01" value={priceMax} onChange={event => setPriceMax(event.target.value)} /></label>
    </div>
    <div id="discovery-filter-toggles" className={`test-filter-toggles${filtersExpanded ? ' is-expanded' : ''}`}><label><input aria-label="Limit to selected city radius" type="checkbox" checked={useRadius} onChange={event => setUseRadius(event.target.checked)} />Within a selected city radius</label><label>Radius <select aria-label="Search radius in kilometres" value={radiusKm} onChange={event => setRadiusKm(event.target.value)}><option>5</option><option>10</option><option>25</option><option>50</option><option>100</option></select> km</label><label><input aria-label="Open now" type="checkbox" checked={openNow} onChange={event => setOpenNow(event.target.checked)} />Open now (India time)</label><label><input aria-label="Has a launch in the last 30 days" type="checkbox" checked={newlyLaunched} onChange={event => setNewlyLaunched(event.target.checked)} />Has a launch in the last 30 days</label><label><input aria-label="Email-verified founder account" type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} />Email-verified founder account</label></div>
    <div className="test-action-row"><Button primary onClick={() => void load()} disabled={busy}>{busy ? 'Searching…' : 'Search nearby'}</Button><Button onClick={() => setView('list')} disabled={view === 'list'}>List view</Button><Button onClick={() => setView('map')} disabled={view === 'map'}>Map view</Button><span className="test-muted">{items.length} results · {city || 'all cities'}</span></div>
    {error && <Notice error>{error}</Notice>}
    {view === 'map' && <div className="test-map-panel" role="region" aria-label={`Business map for ${city || 'current search'}`}>
      <div className="test-map-heading"><div><span className="test-eyebrow">BUSINESS MAP</span><h2>Results in {city || 'your search'}</h2></div><span className="test-map-count">{mapLocations.length} pinned · {items.length} results</span></div>
      {mapLocations.length ? <div className="test-map-canvas" role="group" aria-label={`Founder-shared business locations in ${city || 'the current search'}`}>
        <div className="test-map-grid" aria-hidden="true"><span>{city ? `${city} · ${area || 'selected area'}` : area || 'Selected area'}</span><span>COORDINATE PLOT</span></div>
        {mapLocations.map(location => <button key={location.business.id} className={`test-map-marker${selectedBusinessId === location.business.id ? ' is-selected' : ''}${location.x > 52 ? ' is-label-left' : ''}`} type="button" style={{ left: `${location.x}%`, top: `${location.y}%` }} aria-label={`Pin ${location.markerNumber}: ${location.business.name}, ${location.business.latitude!.toFixed(5)}, ${location.business.longitude!.toFixed(5)}`} aria-pressed={selectedBusinessId === location.business.id} data-map-marker={location.business.id} onClick={() => setSelectedBusinessId(location.business.id)}><span aria-hidden="true">{location.markerNumber}</span><span className="test-map-marker-label" aria-hidden="true">{location.business.name}</span></button>)}
        <div className="test-map-legend"><span aria-hidden="true" />Founder-shared coordinates</div>
      </div> : busy ? <div className="test-map-empty test-map-loading" role="status" aria-live="polite">{city.trim() ? `Finding makers near ${city.trim()}…` : 'Finding makers near you…'}</div> : error ? <div className="test-map-empty test-map-error" role="alert"><p>We couldn’t load the map. Switch to list view or try again.</p><div className="test-map-error-actions"><Button onClick={() => setView('list')}>List view</Button><Button onClick={() => void load()} disabled={busy}>Try again</Button></div></div> : <div className="test-map-empty" role="status">{items.length ? 'No founder-provided coordinates are available for these results. They remain in the list but are not pinned.' : 'No makers found in this area. Try a wider distance or choose another city.'}</div>}
      {mapLocations.length > 0 && <div className="test-map-location-list" aria-label="Pinned businesses">{mapLocations.map(location => <button key={location.business.id} type="button" aria-pressed={selectedBusinessId === location.business.id} onClick={() => setSelectedBusinessId(location.business.id)}><span>{location.markerNumber}</span><strong>{location.business.name}</strong><small>{[location.business.area, location.business.city].filter(Boolean).join(', ') || 'Founder-shared location'}</small></button>)}</div>}
      {businessesWithoutCoordinates.length > 0 && <div className="test-map-unlocated" role="status"><strong>{businessesWithoutCoordinates.length} {businessesWithoutCoordinates.length === 1 ? 'result has' : 'results have'} no map pin</strong><p>The founder has not shared valid latitude and longitude, so no location is guessed.</p><div>{businessesWithoutCoordinates.map(business => <button type="button" key={business.id} aria-pressed={selectedBusinessId === business.id} onClick={() => setSelectedBusinessId(business.id)}>{business.name} · Location not shared</button>)}</div></div>}
      {selectedBusiness && <div className="test-map-selected" aria-live="polite"><span className="test-eyebrow">SELECTED RESULT</span><strong>{selectedBusiness.name}</strong>{hasFounderCoordinates(selectedBusiness) ? <span>{selectedBusiness.latitude!.toFixed(5)}, {selectedBusiness.longitude!.toFixed(5)} · {[selectedBusiness.area, selectedBusiness.city].filter(Boolean).join(', ')}</span> : <p>No marker is shown because this founder has not shared valid coordinates.</p>}<Link to={`/test/brand/${selectedBusiness.slug}`}>View business</Link></div>}
      <p className="test-map-note">Relative placement uses only coordinates shared by each founder. No device location or paid map service is used; distance and radius filters remain based on the selected city and radius.</p>
    </div>}
    {items.length ? <div className="test-business-grid">{items.map(business => { const mapLocation = mapLocationById.get(business.id); return <article className={`test-business-card${selectedBusinessId === business.id ? ' is-map-selected' : ''}`} key={business.id}>
      <div className="test-business-card-head"><div className="test-business-card-identity"><BusinessThumbnail business={business} /><div className="test-business-card-copy"><span className="test-eyebrow">{business.category || 'Business'}</span><h2><Link to={`/test/brand/${business.slug}`}>{business.name}</Link></h2><p>{business.tagline || business.description}</p></div></div><span className="test-status-chip">{business.openNow === true ? 'Open now' : business.openNow === false ? 'Closed' : business.businessMode || 'online'}</span></div>
      <div className="test-business-location">{[business.area, business.city, business.state].filter(Boolean).join(', ')}{business.distanceKm != null && <span>{business.distanceKm.toFixed(1)} km away</span>}{business.verified && <span>Email-verified founder</span>}<span className={mapLocation ? 'test-location-shared' : 'test-location-unshared'}>{mapLocation ? `Map pin ${mapLocation.markerNumber}` : 'Location not shared'}</span></div>
      <div className="test-action-row">{mapLocation && <Button onClick={() => { setSelectedBusinessId(business.id); setView('map') }}>Show on map · {mapLocation.markerNumber}</Button>}<FollowBusiness business={business} user={user} onChange={() => { void load() }} /><BusinessSaveControl business={business} user={user} /><Link className="test-inline-link" to={`/test/brand/${business.slug}?source=${useRadius ? 'nearby' : 'search'}`}>View business</Link></div>
      <ContactActions business={business} source={useRadius ? 'nearby' : 'search'} />
    </article>})}</div> : !busy && !error && <Notice>No businesses match these filters yet. Try another city, category, or distance.</Notice>}
  </section>
}

export function FollowingPage({ user }: { user: User | null }) {
  const [items, setItems] = useState<Launch[]>([])
  const [error, setError] = useState('')
  useEffect(() => { if (!user) return; let active = true; void api<Page<Launch>>('/me/following').then(result => { if (active) setItems(result.items) }).catch(err => { if (active) setError(message(err)) }); return () => { active = false } }, [user?.id])
  return <section className="test-content-width test-feature-page"><FeedModeSwitch current="following" /><Heading eyebrow="PERSONALIZED FEED" title="Following" description="Recent public launches from the founders, businesses, and categories you follow." />
    {!user && <Notice><Link to="/test/account">Sign in to view your Following feed.</Link></Notice>}{error && <Notice error>{error}</Notice>}
    {items.length ? <div className="test-launch-list">{items.map(item => <LaunchCard key={item.id} item={item} source="following" />)}</div> : user && !error && <Notice>Your Following feed is empty. Follow a business from <Link to="/test/nearby">Explore near you</Link> or follow categories while browsing.</Notice>}
    <Link className="test-button test-button-primary" to="/test/nearby">Find businesses to follow</Link>
  </section>
}

export function ForYouPage() {
  const [items, setItems] = useState<ForYouItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryLoadError, setCategoryLoadError] = useState(false)
  const [filters, setFilters] = useState<ForYouFilters>(EMPTY_FOR_YOU_FILTERS)
  const [activeFilters, setActiveFilters] = useState<ForYouFilters>(EMPTY_FOR_YOU_FILTERS)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [ranking, setRanking] = useState<Pick<ForYouResponse, 'coldStart' | 'rankingMode'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const requestSequence = useRef(0)

  const loadFeed = useCallback(async (queryFilters: ForYouFilters, cursor: string | null, append: boolean) => {
    const requestId = ++requestSequence.current
    setError('')
    if (append) setLoadingMore(true)
    else setLoading(true)
    const params = new URLSearchParams({ limit: '20' })
    if (cursor) params.set('cursor', cursor)
    if (queryFilters.city.trim()) params.set('city', queryFilters.city.trim())
    if (queryFilters.state.trim()) params.set('state', queryFilters.state.trim())
    if (queryFilters.category) params.set('category', queryFilters.category)
    try {
      const result = await api<ForYouResponse>(`/for-you?${params.toString()}`, { cache: 'no-store' })
      if (requestSequence.current !== requestId) return
      setItems(current => append ? [...current, ...result.items] : result.items)
      setNextCursor(result.nextCursor)
      setRanking({ coldStart: result.coldStart, rankingMode: result.rankingMode })
    } catch (err) {
      if (requestSequence.current !== requestId) return
      setError(message(err))
      if (!append) {
        setItems([])
        setNextCursor(null)
        setRanking(null)
      }
    } finally {
      if (requestSequence.current === requestId) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    void api<{ categories: Category[] }>('/categories', { cache: 'no-store' })
      .then(result => { if (active) setCategories(result.categories) })
      .catch(() => { if (active) setCategoryLoadError(true) })
    return () => { active = false }
  }, [])

  useEffect(() => { void loadFeed(EMPTY_FOR_YOU_FILTERS, null, false) }, [loadFeed])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextFilters = { city: filters.city.trim(), state: filters.state.trim(), category: filters.category }
    setActiveFilters(nextFilters)
    void loadFeed(nextFilters, null, false)
  }

  const isColdStart = ranking?.coldStart || ranking?.rankingMode === 'popular_recent'

  return <section className="test-content-width test-feature-page test-for-you-page" data-testid="for-you-page" aria-busy={loading || loadingMore}>
    <FeedModeSwitch current="for-you" />
    <Heading eyebrow="COMMUNITY DISCOVERY" title="For you" description="A fresh mix of public launches, ranked for discovery. Recommendations are available whether or not you’re signed in." />
    <form className="test-for-you-filters" onSubmit={applyFilters} aria-label="Filter For You recommendations">
      <label className="test-field" htmlFor="for-you-city"><span>City</span><input id="for-you-city" maxLength={80} value={filters.city} onChange={event => setFilters(current => ({ ...current, city: event.target.value }))} placeholder="Any city" /></label>
      <label className="test-field" htmlFor="for-you-state"><span>State</span><input id="for-you-state" maxLength={80} value={filters.state} onChange={event => setFilters(current => ({ ...current, state: event.target.value }))} placeholder="Any state" /></label>
      <label className="test-field" htmlFor="for-you-category"><span>Category</span><select id="for-you-category" value={filters.category} onChange={event => setFilters(current => ({ ...current, category: event.target.value }))}><option value="">All categories</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <button className="test-button test-button-primary" type="submit" disabled={loading || loadingMore}>Apply filters</button>
    </form>
    {categoryLoadError && <p className="test-muted" role="status">Category choices are temporarily unavailable; city and state filters still work.</p>}
    {ranking && <div className={`test-for-you-ranking${isColdStart ? ' is-cold-start' : ''}`} data-testid="for-you-ranking" data-cold-start={String(isColdStart)}><strong>{isColdStart ? 'Popular & recent' : 'Personalized recommendations'}</strong><span>{isColdStart ? 'A useful starting point while we learn what’s relevant.' : 'Ranked using your available interests and location signals.'}</span></div>}
    {error && <div className="test-notice test-notice-error test-for-you-error" role="alert" data-testid="for-you-error"><span>{error}</span><button type="button" className="test-button test-button-secondary" onClick={() => void loadFeed(activeFilters, null, false)}>Try again</button></div>}
    {loading && items.length === 0 && <div className="test-notice test-for-you-loading" role="status" data-testid="for-you-loading">Loading recommendations…</div>}
    {!loading && !error && items.length === 0 && <div className="test-notice test-for-you-empty" role="status" data-testid="for-you-empty"><strong>No recommendations yet</strong><span>There aren’t any public launches to recommend for these filters right now. Try another location or category.</span></div>}
    {items.length > 0 && <div className="test-for-you-list" data-testid="for-you-list">{items.map(item => <div className="test-for-you-item" key={item.id} data-testid="for-you-item" data-launch-id={item.id}>
      <p className="test-for-you-reason" data-testid="for-you-recommendation-reason"><strong>Why this launch</strong><span>{item.recommendationReason}</span></p>
      <LaunchCard item={item} source="for-you" />
    </div>)}</div>}
    {nextCursor && <button type="button" className="test-button test-button-secondary test-for-you-load-more" disabled={loadingMore} onClick={() => void loadFeed(activeFilters, nextCursor, true)}>{loadingMore ? 'Loading more recommendations…' : 'Load more recommendations'}</button>}
    <Link className="test-inline-link test-for-you-discover-link" to="/test/nearby">Explore businesses near you</Link>
  </section>
}

function collectionShareToken(item: Collection) {
  let sharePath = ''
  if (item.shareUrl) {
    try { sharePath = new URL(item.shareUrl, 'https://aarambh.invalid').pathname }
    catch { sharePath = '' }
  }
  const shareToken = item.isPublic ? sharePath.match(/^\/test\/collection\/([^/]+)\/?$/u)?.[1] : undefined
  return shareToken && shareToken !== 'undefined' && shareToken !== 'null' ? shareToken : undefined
}

function collectionTitle(item: Collection) {
  const shareToken = collectionShareToken(item)
  return shareToken
    ? <Link to={`/test/collection/${encodeURIComponent(shareToken)}`}>{item.name}</Link>
    : <span>{item.name}</span>
}

export function CollectionsPage({ user }: { user: User | null }) {
  const [items, setItems] = useState<Collection[]>([])
  const [publicItems, setPublicItems] = useState<Collection[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState('')
  const [publicError, setPublicError] = useState('')
  const [publicLoading, setPublicLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { if (!user) return; try { setItems((await api<{ items: Collection[] }>('/me/collections')).items); setError('') } catch (err) { setError(message(err)) } }, [user?.id])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let active = true
    void api<Page<Collection>>('/collections/public?limit=12').then(result => { if (active) { setPublicItems(result.items); setPublicError('') } }).catch(err => { if (active) setPublicError(message(err)) }).finally(() => { if (active) setPublicLoading(false) })
    return () => { active = false }
  }, [])
  async function create(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await api('/me/collections', { method: 'POST', body: body({ collection: { name, description, isPublic } }) }); setName(''); setDescription(''); await load() } catch (err) { setError(message(err)) } finally { setBusy(false) } }
  async function togglePrivacy(item: Collection) { try { await api(`/me/collections/${item.id}`, { method: 'PATCH', body: body({ collection: { isPublic: !item.isPublic } }) }); await load() } catch (err) { setError(message(err)) } }
  async function remove(item: Collection) { try { await api(`/me/collections/${item.id}`, { method: 'DELETE' }); await load() } catch (err) { setError(message(err)) } }
  return <section className="test-content-width test-feature-page"><Heading eyebrow="PUBLIC COMMUNITY" title="Collections" description="Discover thoughtful public lists from makers and save your own launches to revisit later." />
    <section className="test-public-collections" aria-labelledby="test-public-collections-heading">
      <div className="test-section-heading"><div><span className="test-eyebrow">CURATED LAUNCH LISTS</span><h2 id="test-public-collections-heading">Collections to explore</h2></div><span>{publicLoading ? 'Loading…' : `${publicItems.length} public ${publicItems.length === 1 ? 'collection' : 'collections'}`}</span></div>
      <p className="test-public-collections-intro">A few community-made ways to find independent ideas. Every collection and launch shown here is synthetic.</p>
      {publicError && <Notice error>{publicError}</Notice>}
      {publicLoading && !publicItems.length && <Notice>Loading public collections…</Notice>}
      {!publicLoading && !publicError && !publicItems.length && <Notice>No public collections are available yet.</Notice>}
      {publicItems.length > 0 && <div className="test-public-collection-grid">{publicItems.map(item => {
        const token = collectionShareToken(item)
        const cover = item.launches[0]?.images?.[0]
        return <article className="test-public-collection-card" key={item.id}>
          {token ? <Link to={`/test/collection/${encodeURIComponent(token)}`} className="test-public-collection-image" aria-label={`Open public collection ${item.name}`}>
            {cover ? <img src={cover.url} alt={cover.altText || ''} loading="lazy" /> : <span>{item.name.slice(0, 1)}</span>}
            <span className="test-public-collection-badge">Public</span>
          </Link> : <div className="test-public-collection-image">
            {cover ? <img src={cover.url} alt={cover.altText || ''} loading="lazy" /> : <span>{item.name.slice(0, 1)}</span>}
            <span className="test-public-collection-badge">Public</span>
          </div>}
          <div className="test-public-collection-copy"><span className="test-eyebrow">{item.launchCount} {item.launchCount === 1 ? 'launch' : 'launches'}</span><h3>{token ? <Link to={`/test/collection/${encodeURIComponent(token)}`}>{item.name}</Link> : item.name}</h3><p>{item.description || 'A public synthetic collection from the community.'}</p>{token ? <Link className="test-public-collection-open" to={`/test/collection/${encodeURIComponent(token)}`}>Explore collection <span aria-hidden="true">→</span></Link> : <span className="test-muted">Share link unavailable</span>}</div>
        </article>
      })}</div>}
      {!user && <div className="test-public-collection-signin"><span className="test-eyebrow">SAVE A COLLECTION</span><strong>Keep your favorite maker lists close.</strong><span>Sign in to create and manage your own collections.</span><Link className="test-button test-button-primary" to="/test/account">Sign in</Link></div>}
    </section>
    <section className="test-collection-management" aria-labelledby="test-collection-management-heading"><div className="test-section-heading"><div><span className="test-eyebrow">SAVED LISTS</span><h2 id="test-collection-management-heading">Your collections</h2></div></div>
    {!user && <Notice><Link to="/test/account">Sign in to create collections.</Link></Notice>}{error && <Notice error>{error}</Notice>}
    {user && <form className="test-workspace-card test-collection-form" onSubmit={event => void create(event)}><h2>Create a collection</h2><label className="test-field"><span>Name</span><input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Ahmedabad Startups" /></label><label className="test-field"><span>Description (optional)</span><textarea rows={2} maxLength={500} value={description} onChange={event => setDescription(event.target.value)} /></label><label className="test-check"><input type="checkbox" checked={isPublic} onChange={event => setIsPublic(event.target.checked)} />Public and shareable</label><button className="test-button test-button-primary" disabled={busy}>Create collection</button></form>}
    {items.length ? <div className="test-collection-list">{items.map(item => <article className="test-workspace-card test-collection-card" key={item.id}><div className="test-section-heading"><div><span className="test-eyebrow">{item.isPublic ? 'PUBLIC LINK' : 'PRIVATE'}</span><h2>{collectionTitle(item)}</h2></div><span>{item.launchCount} launches</span></div><p>{item.description || 'No description added.'}</p><div className="test-action-row"><Button onClick={() => void togglePrivacy(item)}>{item.isPublic ? 'Make private' : 'Make public'}</Button>{collectionShareToken(item) && item.shareUrl && <a className="test-button test-button-secondary" href={item.shareUrl} target="_blank" rel="noopener noreferrer">Open share link</a>}<Button onClick={() => void remove(item)}>Delete</Button></div>{item.launches.length > 0 && <div className="test-collection-launches">{item.launches.slice(0, 3).map(launch => <Link key={launch.id} to={`/test/launch/${launch.slug}`}>{launch.title}</Link>)}</div>}<p className="test-muted">To add launches, open a launch and choose “Add to collection”.</p></article>)}</div> : user && <Notice>No collections yet. Create a private list or publish a shareable one.</Notice>}
    </section>
  </section>
}

export function CollectionSharePage({ token }: { token: string }) {
  const [item, setItem] = useState<Collection | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { if (!token) return; void api<{ item: Collection }>(`/collections/share/${encodeURIComponent(token)}`).then(result => setItem(result.item)).catch(err => setError(message(err))) }, [token])
  const cover = item?.launches[0]?.images?.[0]
  return <section className="test-content-width test-feature-page"><Link to="/test/collections" className="test-back-link">← Collections</Link>
    {item ? <header className="test-collection-share-hero"><div><span className="test-eyebrow">PUBLIC COMMUNITY COLLECTION</span><h1>{item.name}</h1><p>{item.description || 'A public collection of independent launches from the community.'}</p><div className="test-collection-share-meta"><strong>{item.launchCount}</strong> {item.launchCount === 1 ? 'launch' : 'launches'} <span>·</span> Synthetic public list</div></div>{cover ? <img src={cover.url} alt={cover.altText || `Cover for ${item.name}`} /> : <div className="test-collection-share-placeholder" aria-hidden="true">A</div>}</header> : <Heading eyebrow="PUBLIC COLLECTION" title={error ? 'Collection unavailable' : 'Loading collection…'} />}
    {error && <Notice error>{error}</Notice>}{item?.launches.length ? <div className="test-launch-list">{item.launches.map(launch => <LaunchCard key={launch.id} item={launch} source="collection" />)}</div> : item && <Notice>This collection has no published launches yet.</Notice>}</section>
}

export function AddToCollection({ launch, user }: { launch: Launch; user: User | null }) {
  const [items, setItems] = useState<Collection[]>([])
  const [selected, setSelected] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { if (!user) return; let active = true; void api<{ items: Collection[] }>('/me/collections').then(result => { if (active) { setItems(result.items); setSelected(result.items[0]?.id || '') } }).catch(() => {}); return () => { active = false } }, [user?.id])
  async function add() { if (!selected) { setNotice('Create a collection first.'); return } try { await api(`/me/collections/${selected}/items`, { method: 'POST', body: body({ launchId: launch.id }) }); setNotice('Added to collection.') } catch (err) { setNotice(message(err)) } }
  if (!user) return <Link className="test-inline-link" to="/test/account">Sign in to organize launches into collections</Link>
  if (!items.length) return <Link className="test-inline-link" to="/test/collections">Create a collection to save this launch to a list</Link>
  return <div className="test-add-collection"><label className="test-field"><span>Add to collection</span><select value={selected} onChange={event => setSelected(event.target.value)}>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button onClick={() => void add()}>Add to list</Button>{notice && <span role="status">{notice}</span>}</div>
}

export function LifecyclePanel({ launch, user }: { launch: Launch & { launchAt?: string }; user: User | null }) {
  const [lifecycle, setLifecycle] = useState<{ lifecycleStage: string; launchAt?: string; countdownSeconds?: number; notified: boolean } | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [notice, setNotice] = useState('')
  useEffect(() => { let active = true; void api<typeof lifecycle>(`/launches/${encodeURIComponent(launch.slug)}/lifecycle`).then(result => { if (active) { setLifecycle(result); setSeconds(result?.countdownSeconds || 0) } }).catch(() => {}); return () => { active = false } }, [launch.slug])
  useEffect(() => { const timer = window.setInterval(() => setSeconds(value => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer) }, [])
  async function toggleNotify() { if (!user) { setNotice('Sign in to receive launch notifications.'); return } try { const response = await api<{ notified: boolean }>(`/launches/${encodeURIComponent(launch.slug)}/notify`, { method: lifecycle?.notified ? 'DELETE' : 'PUT', ...(lifecycle?.notified ? {} : { body: '{}' }) }); setLifecycle(current => current ? { ...current, notified: response.notified } : current); setNotice(response.notified ? 'Launch reminder set.' : 'Launch reminder removed.') } catch (err) { setNotice(message(err)) } }
  const timeLabel = useMemo(() => `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`, [seconds])
  if (!lifecycle) return null
  return <div className="test-lifecycle-panel"><div><span className="test-eyebrow">DISCOVERY STAGE</span><strong>{lifecycle.lifecycleStage.replaceAll('_', ' ')}</strong>{lifecycle.launchAt && <span>{new Date(lifecycle.launchAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} · India time</span>}{seconds > 0 && <span className="test-countdown">Starts in {timeLabel}</span>}</div><Button onClick={() => void toggleNotify()}>{lifecycle.notified ? 'Remove reminder' : 'Notify me when launched'}</Button>{notice && <small role="status">{notice}</small>}</div>
}

type DatedLaunch = Launch & { launchAt?: string; countdownSeconds?: number; anniversaryDate?: string }
function indiaDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  return Object.fromEntries(parts.map(part => [part.type, part.value])) as Record<'year' | 'month' | 'day', string>
}
function upcomingDateKey(item: DatedLaunch, tab: 'upcoming' | 'anniversaries') {
  const raw = tab === 'upcoming' ? item.launchAt : item.anniversaryDate
  if (!raw) return ''
  if (tab === 'anniversaries') {
    const parts = indiaDateParts(new Date())
    const monthDay = raw.match(/^\d{4}-(\d{2})-(\d{2})/)
    return monthDay ? `${parts.year}-${monthDay[1]}-${monthDay[2]}` : ''
  }
  const value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00+05:30`) : new Date(raw)
  if (!Number.isFinite(value.getTime())) return ''
  const parts = indiaDateParts(value)
  return `${parts.year}-${parts.month}-${parts.day}`
}
function formatIndiaDay(value: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'full' }) {
  return new Date(`${value}T12:00:00+05:30`).toLocaleDateString('en-IN', { ...options, timeZone: 'Asia/Kolkata' })
}
function formatLaunchTime(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = dateOnly ? new Date(`${value}T12:00:00+05:30`) : new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', ...(dateOnly ? {} : { timeStyle: 'short' }) }) + (dateOnly ? '' : ' IST')
}

export function UpcomingPage() {
  const [tab, setTab] = useState<'upcoming' | 'anniversaries'>('upcoming')
  const [items, setItems] = useState<DatedLaunch[]>([])
  const [error, setError] = useState('')
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState('')
  const [indiaToday] = useState(() => indiaDateParts(new Date()))
  useEffect(() => { let active = true; setError(''); setItems([]); void api<Page<DatedLaunch>>(`/launches/${tab}`).then(result => { if (active) setItems(result.items) }).catch(err => { if (active) setError(message(err)) }); return () => { active = false } }, [tab])
  const monthDate = new Date(Date.UTC(Number(indiaToday.year), Number(indiaToday.month) - 1 + monthOffset, 1))
  const year = monthDate.getUTCFullYear()
  const month = monthDate.getUTCMonth() + 1
  const monthKey = `${year}-${String(month).padStart(2, '0')}`
  const monthLabel = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const datedItems = useMemo(() => items.map(item => ({ item, dateKey: upcomingDateKey(item, tab) })), [items, tab])
  const itemsByDate = useMemo(() => datedItems.reduce<Record<string, DatedLaunch[]>>((map, entry) => { if (entry.dateKey) (map[entry.dateKey] ||= []).push(entry.item); return map }, {}), [datedItems])
  const monthDates = Object.keys(itemsByDate).filter(key => key.startsWith(`${monthKey}-`)).sort()
  const activeDate = selectedDate.startsWith(`${monthKey}-`) ? selectedDate : monthDates[0] || `${monthKey}-01`
  const activeItems = itemsByDate[activeDate] || []
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const eventCountThisMonth = monthDates.reduce((total, key) => total + itemsByDate[key].length, 0)
  const undatedItems = datedItems.filter(entry => !entry.dateKey).map(entry => entry.item)
  return <section className="test-content-width test-feature-page test-upcoming-calendar" data-testid="upcoming-calendar">
    <Heading eyebrow="LAUNCH CALENDAR · ASIA/KOLKATA" title={tab === 'upcoming' ? 'Upcoming launches' : 'Launch anniversaries'} description="Browse scheduled launches in the India-time calendar, or see businesses celebrating a launch anniversary today." />
    <div className="test-upcoming-toolbar"><div className="test-upcoming-tabs" role="group" aria-label="Calendar view">
      <button className="test-upcoming-tab" type="button" aria-pressed={tab === 'upcoming'} onClick={() => { setTab('upcoming'); setMonthOffset(0); setSelectedDate('') }}>Coming soon</button>
      <button className="test-upcoming-tab" type="button" aria-pressed={tab === 'anniversaries'} onClick={() => { setTab('anniversaries'); setMonthOffset(0); setSelectedDate('') }}>Anniversaries</button>
    </div><span className="test-upcoming-count">{items.length} {tab === 'upcoming' ? 'scheduled launches' : 'anniversaries in this API result'} · India time</span></div>
    {error && <Notice error>{error}</Notice>}
    {!error && !items.length && <Notice>No {tab === 'upcoming' ? 'scheduled launches' : 'launch anniversaries'} to show yet.</Notice>}
    <div className="test-calendar-layout">
      <section className="test-calendar-board" aria-label={`${monthLabel} launch calendar`}>
        <div className="test-calendar-monthbar"><button type="button" aria-label="Previous month" disabled={tab === 'anniversaries'} onClick={() => setMonthOffset(value => value - 1)}>‹</button><h2>{monthLabel}</h2><button type="button" aria-label="Next month" disabled={tab === 'anniversaries'} onClick={() => setMonthOffset(value => value + 1)}>›</button></div>
        <div className="test-calendar-grid" role="group" aria-label={`${monthLabel} dates`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span className="test-calendar-weekday" aria-hidden="true" key={day}>{day}</span>)}
          {Array.from({ length: 42 }, (_, index) => {
            const day = index - firstWeekday + 1
            if (day < 1 || day > daysInMonth) return <span className="test-calendar-day is-outside" aria-hidden="true" key={`blank-${index}`} />
            const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`
            const dayItems = itemsByDate[dateKey] || []
            return <button className={`test-calendar-day ${dateKey === activeDate ? 'is-selected' : ''}`} type="button" aria-label={`${formatIndiaDay(dateKey)}${dayItems.length ? `, ${dayItems.length} launch${dayItems.length === 1 ? '' : 'es'}` : ''}`} aria-pressed={dateKey === activeDate} key={dateKey} onClick={() => setSelectedDate(dateKey)}><span className="test-calendar-day-number">{day}</span>{dayItems.length > 0 && <span className="test-calendar-day-count" aria-hidden="true">{dayItems.length}</span>}</button>
          })}
        </div>
        <p className="test-calendar-note">{tab === 'upcoming' ? `${eventCountThisMonth} launch${eventCountThisMonth === 1 ? '' : 'es'} in the current API result for this month.` : 'Anniversaries are returned for today by the existing API; month navigation is disabled for this view.'}</p>
      </section>
      <section className="test-agenda" aria-label="Selected day agenda">
        <header className="test-agenda-heading"><span>Selected day · India time</span><h2>{formatIndiaDay(activeDate)}</h2><p>{activeItems.length ? `${activeItems.length} item${activeItems.length === 1 ? '' : 's'} on this day` : 'No returned events on this day'}</p></header>
        {activeItems.length ? activeItems.map(item => {
          const rawDate = tab === 'upcoming' ? item.launchAt : item.anniversaryDate
          const dateLabel = tab === 'upcoming' ? (rawDate ? formatLaunchTime(rawDate) : formatIndiaDay(activeDate)) : `Launch anniversary · ${formatIndiaDay(activeDate, { day: 'numeric', month: 'short' })}`
          return <article className="test-workspace-card test-calendar-card test-agenda-card" key={item.id} data-testid="calendar-event-card"><div className="test-agenda-date"><strong>{formatIndiaDay(activeDate, { day: 'numeric' })}</strong><span>{formatIndiaDay(activeDate, { month: 'short' })}</span></div><div className="test-agenda-copy"><span>{tab === 'upcoming' ? 'Coming soon' : 'Anniversary'}</span><h3><Link to={`/test/launch/${item.slug}`}>{item.title}</Link></h3><p>{item.summary || item.story || 'A launch from the Aarambh community.'}</p><div className="test-agenda-meta"><time dateTime={rawDate || activeDate}>{dateLabel}</time>{item.countdownSeconds != null && <strong>{Math.floor(item.countdownSeconds / 86400)} days remaining</strong>}{item.brand?.name && <span>{item.brand.name}</span>}</div></div></article>
        }) : <div className="test-agenda-empty"><strong>No events on this date</strong><span>{tab === 'upcoming' ? 'Choose a marked day to see its scheduled launches.' : 'The anniversary endpoint returns today’s celebrations only.'}</span></div>}
      </section>
    </div>
    {undatedItems.length > 0 && <section className="test-undated-list"><h2>Other launches in this response</h2>{undatedItems.map(item => <article className="test-calendar-card" key={item.id}><Link to={`/test/launch/${item.slug}`}>{item.title}</Link><span>{item.brand?.name || 'Aarambh business'}</span><p>{item.summary || item.story || 'Launch details'}</p></article>)}</section>}
  </section>
}

type ReviewReportReason = 'misleading' | 'conflict_of_interest' | 'abuse' | 'other'
type ReviewItem = { id: string; overallRating: number; wouldRecommend: boolean; createdAt: string }
type ReviewSummary = { count: number; average: number | null; averages?: { quality: number; value: number; experience: number; recommendRate: number }; items: ReviewItem[]; ownReview?: { id: string; overallRating: number } | null }
type ReviewReportQueueItem = { id: string; reviewId: string; brandId: string; reason: ReviewReportReason; rating: number; createdAt: string }
const reviewReportReasons: Array<{ value: ReviewReportReason; label: string }> = [
  { value: 'misleading', label: 'Misleading' },
  { value: 'conflict_of_interest', label: 'Conflict of interest' },
  { value: 'abuse', label: 'Abuse' },
  { value: 'other', label: 'Other' },
]

function ReportReviewControl({ reviewId, ownReviewId, user }: { reviewId: string; ownReviewId?: string; user: User | null }) {
  const [reason, setReason] = useState<ReviewReportReason>('misleading')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [isError, setIsError] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  if (!user?.emailVerified || reviewId === ownReviewId) return null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNotice('')
    setIsError(false)
    try {
      const result = await api<{ accepted: boolean }>(`/reviews/${encodeURIComponent(reviewId)}/report`, { method: 'POST', body: body({ reason }) })
      if (!result.accepted) throw new Error('The review report was not accepted by the API.')
      setSubmitted(true)
      setNotice('Report accepted for moderator review.')
    } catch (err) {
      setNotice(message(err))
      setIsError(true)
    } finally {
      setBusy(false)
    }
  }

  return <form className="test-review-form test-review-report" onSubmit={event => void submit(event)}>
    {!submitted && <><label className="test-field"><span>Report reason</span><select aria-label={`Report reason for review ${reviewId}`} value={reason} onChange={event => setReason(event.target.value as ReviewReportReason)}>{reviewReportReasons.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button type="submit" className="test-button test-button-secondary" disabled={busy}>{busy ? 'Sending report…' : 'Report review'}</button></>}
    {notice && <Notice error={isError}>{notice}</Notice>}
  </form>
}

function ReviewModerationQueue({ user }: { user: User | null }) {
  const [items, setItems] = useState<ReviewReportQueueItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actingOn, setActingOn] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadQueue() {
    if (!user?.emailVerified) return
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const result = await api<{ items: ReviewReportQueueItem[] }>('/admin/reviews/reports')
      setItems(result.items)
      setLoaded(true)
    } catch (err) {
      setError(message(err))
    } finally {
      setLoading(false)
    }
  }

  async function actOnReport(item: ReviewReportQueueItem, action: 'hide' | 'restore') {
    setActingOn(item.id)
    setError('')
    setNotice('')
    try {
      const result = await api<{ action: 'hide' | 'restore'; reviewId: string }>(`/admin/reviews/${encodeURIComponent(item.reviewId)}/actions`, { method: 'POST', body: body({ action }) })
      if (result.action !== action || result.reviewId !== item.reviewId) throw new Error('The moderation API returned an unexpected action response.')
      const refreshed = await api<{ items: ReviewReportQueueItem[] }>('/admin/reviews/reports')
      setItems(refreshed.items)
      setLoaded(true)
      setNotice(result.action === 'hide' ? 'Review hidden; its open report was actioned.' : 'Report dismissed; the review remains visible.')
    } catch (err) {
      setError(message(err))
    } finally {
      setActingOn('')
    }
  }

  if (!user?.emailVerified) return null
  return <section className="test-workspace-card test-review-moderation">
    <div className="test-section-heading"><div><span className="test-eyebrow">MODERATOR TOOLS</span><h3>Review reports</h3></div></div>
    <p className="test-muted">Moderator access is checked by the API when the queue is loaded. Only authorized moderators can take action.</p>
    <Button onClick={() => void loadQueue()} disabled={loading || Boolean(actingOn)}>{loading ? 'Loading reports…' : loaded ? 'Refresh moderator queue' : 'Load moderator queue'}</Button>
    {notice && <Notice>{notice}</Notice>}{error && <Notice error>{error}</Notice>}
    {loaded && (items.length ? <div className="test-review-report-queue">{items.map(item => <article className="test-notification-card" key={item.id}>
      <div><span className="test-eyebrow">Reported {new Date(item.createdAt).toLocaleString('en-IN')}</span><p>Review <code>{item.reviewId}</code> · {item.rating} / 5</p><p>Reason: <strong>{reviewReportReasons.find(reason => reason.value === item.reason)?.label || item.reason}</strong></p><Link className="test-inline-link" to={`/test/brand/${encodeURIComponent(item.brandId)}`}>Open business review page</Link></div>
      <div className="test-action-row"><Button onClick={() => void actOnReport(item, 'hide')} disabled={Boolean(actingOn)}>Hide review</Button><Button onClick={() => void actOnReport(item, 'restore')} disabled={Boolean(actingOn)}>Dismiss report · keep review visible</Button></div>
    </article>)}</div> : <Notice>No open review reports.</Notice>)}
  </section>
}

export function ReviewsSection({ slug, user, isOwner = false }: { slug: string; user: User | null; isOwner?: boolean }) {
  const [data, setData] = useState<ReviewSummary | null>(null)
  const [ratings, setRatings] = useState({ overallRating: 5, qualityRating: 5, valueRating: 5, experienceRating: 5, wouldRecommend: true })
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setData((await api<{ item: NonNullable<typeof data> }>(`/brands/${encodeURIComponent(slug)}/reviews`)).item) } catch (err) { setNotice(message(err)) } }, [slug])
  useEffect(() => { void load() }, [load])
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setNotice(''); try { await api(`/brands/${encodeURIComponent(slug)}/reviews`, { method: 'POST', body: body({ review: ratings }) }); setNotice('Your structured review is published.'); await load() } catch (err) { setNotice(message(err)) } finally { setBusy(false) } }
  const canReview = user?.emailVerified && !isOwner
  return <section className="test-workspace-card test-reviews-section"><div className="test-section-heading"><div><span className="test-eyebrow">STRUCTURED FEEDBACK · NO COMMENTS</span><h2>Ratings and reviews</h2></div><strong>{data?.average ?? '—'} / 5 · {data?.count ?? 0}</strong></div>
    <p className="test-muted">Only verified members who do not own this business can review it. One review per member and business; owners cannot review themselves. Reviews contain star ratings only.</p>
    {data?.averages && <div className="test-rating-breakdown"><span>Quality {data.averages.quality}/5</span><span>Value {data.averages.value}/5</span><span>Experience {data.averages.experience}/5</span><span>Would recommend {data.averages.recommendRate}%</span></div>}
    {canReview && <form className="test-review-form" onSubmit={event => void submit(event)}>{(['overallRating', 'qualityRating', 'valueRating', 'experienceRating'] as const).map(field => <label className="test-field" key={field}><span>{field === 'overallRating' ? 'Overall rating' : field === 'qualityRating' ? 'Product/service quality' : field === 'valueRating' ? 'Value for money' : 'Experience'}</span><select value={ratings[field]} onChange={event => setRatings(old => ({ ...old, [field]: Number(event.target.value) }))}>{[5, 4, 3, 2, 1].map(value => <option key={value} value={value}>{value} star{value === 1 ? '' : 's'}</option>)}</select></label>)}<label className="test-check"><input type="checkbox" checked={ratings.wouldRecommend} onChange={event => setRatings(old => ({ ...old, wouldRecommend: event.target.checked }))} />Would recommend this business</label><button className="test-button test-button-primary" disabled={busy}>{data?.ownReview ? 'Update my review' : 'Submit structured review'}</button></form>}
    {!user && <Notice><Link to="/test/account">Sign in with a verified synthetic account</Link> to submit a rating.</Notice>}{user && !user.emailVerified && <Notice>Verify your synthetic account before submitting a rating.</Notice>}{isOwner && <Notice>Owners can’t review their own business.</Notice>}{notice && <Notice>{notice}</Notice>}
    {data?.items.length ? <ul className="test-rating-list">{data.items.map(item => <li key={item.id}><div><strong>{item.overallRating} / 5</strong><span>{item.wouldRecommend ? 'Recommends' : 'Does not recommend'} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</time></span></div>{user?.emailVerified && item.id !== data.ownReview?.id && <ReportReviewControl reviewId={item.id} ownReviewId={data.ownReview?.id} user={user} />}</li>)}</ul> : <p className="test-muted">No published ratings yet.</p>}{user?.emailVerified && <ReviewModerationQueue user={user} />}
  </section>
}

export function NotificationsPage({ user }: { user: User | null }) {
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState('')
  const load = useCallback(async () => { if (!user) return; try { const result = await api<Page<Notification> & { unreadCount: number }>('/me/notifications'); setItems(result.items); setUnread(result.unreadCount); setError('') } catch (err) { setError(message(err)) } }, [user?.id])
  useEffect(() => { void load() }, [load])
  async function mark(id: string) { try { await api(`/me/notifications/${id}/read`, { method: 'PATCH', body: '{}' }); await load() } catch (err) { setError(message(err)) } }
  async function markAll() { try { await api('/me/notifications/read-all', { method: 'POST', body: '{}' }); await load() } catch (err) { setError(message(err)) } }
  return <section className="test-content-width test-feature-page"><div className="test-section-heading"><div><Heading eyebrow="IN-APP ALERTS" title="Notifications" description="Launch likes, saves, follows, new launches, trending status, verification, reminders, and moderation updates." /><span className="test-unread-count">{unread} unread</span></div>{user && <Button onClick={() => void markAll()}>Mark all as read</Button>}</div>{!user && <Notice><Link to="/test/account">Sign in to view your notification center.</Link></Notice>}{error && <Notice error>{error}</Notice>}{items.length ? <div className="test-notification-list">{items.map(item => <article className={`test-notification-card ${item.readAt ? 'is-read' : ''}`} key={item.id}><div><span className="test-eyebrow">{item.kind.replaceAll('_', ' ')} · {new Date(item.createdAt).toLocaleString('en-IN')}</span><h2>{item.subject}</h2><p>{item.message}</p></div>{!item.readAt && <Button onClick={() => void mark(item.id)}>Mark read</Button>}</article>)}</div> : user && !error && <Notice>No notifications yet. Follow a founder or business, or like/save a launch to see activity here.</Notice>}</section>
}

export function TrendingPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'risingBusinesses'>('today')
  const [data, setData] = useState<{ today: Array<{ rank: number; title: string; id: string; slug: string; brandName: string; city?: string; category?: string; score: number }>; week: Array<{ rank: number; title: string; id: string; slug: string; brandName: string; city?: string; category?: string; score: number }>; month: Array<{ rank: number; title: string; id: string; slug: string; brandName: string; city?: string; category?: string; score: number }>; risingBusinesses: Array<{ id: string; slug: string; name: string; city?: string; category?: string; interactions: number }> } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api<typeof data>('/trending/dashboard').then(setData).catch(err => setError(message(err))) }, [])
  const items = period === 'today' ? data?.today : period === 'week' ? data?.week : data?.month
  return <section className="test-content-width test-feature-page test-trending-editorial" data-testid="trending-page">
    <Heading eyebrow="COMMUNITY MOMENTUM · PROVISIONAL" title="Trending" description="Discover launches gaining attention and businesses rising in the community. Rankings use synthetic preview engagement and are not a production score." />
    <div className="test-trending-toolbar"><div className="test-trending-tabs" role="group" aria-label="Trending period">
      {(['today', 'week', 'month', 'risingBusinesses'] as const).map(option => <button className="test-trending-tab" type="button" key={option} aria-pressed={period === option} onClick={() => setPeriod(option)}>{option === 'today' ? 'Trending today' : option === 'week' ? 'This week' : option === 'month' ? 'This month' : 'Rising businesses'}</button>)}
    </div><span className="test-trending-caption">{period === 'risingBusinesses' ? 'Businesses with recent engagement' : `${items?.length || 0} launches · ${period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'This month'}`}</span></div>
    {error && <Notice error>{error}</Notice>}
    {period === 'risingBusinesses' ? data?.risingBusinesses.length ? <div className="test-rising-grid">{data.risingBusinesses.map((business, index) => <article className="test-rising-card" key={business.id}><div className="test-rising-topline"><span>Rising maker · {business.city || 'India'}</span><span>#{index + 1}</span></div><span className="test-rising-monogram" aria-hidden="true">{business.name.slice(0, 1).toUpperCase()}</span><h2><Link to={`/test/brand/${business.slug}?source=trending`}>{business.name}</Link></h2><p>{business.category || 'Independent business'}</p><div className="test-rising-metric"><span>Recent interactions</span><strong>{business.interactions}</strong></div></article>)}</div> : data && <Notice>No rising businesses yet.</Notice> : items?.length ? <ol className="test-trending-feed">{items.map(item => <li className="test-trending-card" key={item.id} data-testid="trending-entry"><div className="test-trending-rank"><span>RANK</span><strong>{item.rank}</strong></div><div className="test-trending-copy"><div><span>{item.category || 'Launch'}</span><span>{item.city || 'Across India'}</span></div><h2><Link to={`/test/launch/${item.slug}?source=trending`}>{item.title}</Link></h2><p>From {item.brandName}</p></div><div className="test-trending-score"><span>Momentum</span><strong>{item.score}</strong><small>points</small></div></li>)}</ol> : data && <Notice>Trending rankings are forming. Member likes, saves, and qualified contact clicks contribute to the provisional score.</Notice>}
  </section>
}

export function FounderDashboardPage({ user }: { user: User | null }) {
  const [range, setRange] = useState('7d')
  const [group, setGroup] = useState<'day' | 'week' | 'month'>('day')
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { if (!user) return; let active = true; const period = group === 'day' ? 'daily' : group === 'week' ? 'weekly' : 'monthly'; void api<Dashboard>(`/me/dashboard?range=${range}&period=${period}`).then(result => { if (active) setData(result) }).catch(err => { if (active) setError(message(err)) }); return () => { active = false } }, [user?.id, range, group])
  const chart = useMemo(() => {
    if (!data?.series) return []
    return data.series.map(row => ({ label: String(row.date), views: Number(row.views || 0), websiteClicks: Number(row.websiteClicks || 0), saves: Number(row.saves || 0) }))
  }, [data?.series, group])
  const max = Math.max(1, ...chart.map(item => item.views))
  if (!user) return <section className="test-content-width test-feature-page test-founder-analytics"><Heading eyebrow="FOUNDER HOME" title="Your business dashboard" /><Notice><Link to="/test/account">Sign in to view founder analytics.</Link></Notice></section>
  const totals = data?.totals || {}
  const cards = [['Views', totals.views], ['Profile visits', totals.profileVisits], ['Launch views', totals.launchViews], ['Feed impressions', totals.feedImpressions], ['Website clicks', totals.websiteClicks], ['WhatsApp clicks', totals.whatsappClicks], ['Saves', totals.saves], ['Likes', totals.likes]] as const
  return <section className="test-content-width test-feature-page test-founder-analytics" data-testid="founder-analytics-page">
    <div className="test-founder-hero"><div className="test-founder-hero-main"><img className="test-founder-hero-image" src="/images/growth-maker.jpg" alt="A small-business founder at work" loading="lazy" /><div className="test-founder-hero-copy"><Heading eyebrow="FOUNDER HOME · PRIVATE ANALYTICS" title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user.displayName}.`} description="A private overview of aggregated activity for your businesses. No visitor identities are shown." /><div className="test-founder-actions"><Link className="test-button test-button-primary" to="/test/workspace">Create launch</Link><Link className="test-button test-button-secondary" to="/test/workspace#test-products-section">Add product</Link><Link className="test-button test-button-secondary" to="/test/founder-profile">Update profile</Link><Link className="test-button test-button-secondary" to="/test/analytics">View analytics</Link></div></div></div><aside className="test-founder-hero-aside"><span>Portfolio at a glance</span><strong>{totals.views ?? 0}</strong><small>Profile and launch-detail views in the selected period</small><div className="test-founder-brand-list" aria-label="Your businesses">{data?.brands.length ? data.brands.map(brand => <span key={brand.id}>{brand.name}</span>) : <span>No published businesses yet</span>}</div></aside></div>
    <div className="test-founder-controls"><div><Button primary={range === '7d'} disabled={group !== 'day'} onClick={() => setRange('7d')}>7 days</Button><Button primary={range === '30d'} disabled={group !== 'day'} onClick={() => setRange('30d')}>30 days</Button></div><div><span className="test-muted">Asia/Kolkata · synthetic preview activity</span>{error && <Notice error>{error}</Notice>}</div></div>
    <div className="test-metric-grid test-founder-metrics">{cards.map(([label, value]) => <article className="test-metric-card" key={label}><span>{label}</span><strong>{value ?? 0}</strong></article>)}</div>
    <section className="test-founder-performance"><div className="test-section-heading"><div><span className="test-eyebrow">ACTIVITY OVER TIME</span><h2>Business performance</h2></div><div className="test-action-row">{(['day', 'week', 'month'] as const).map(option => <Button key={option} primary={group === option} onClick={() => setGroup(option)}>{option === 'day' ? 'Daily' : option === 'week' ? 'Weekly' : 'Monthly'}</Button>)}</div></div><div className="test-chart" role="img" aria-label={`Views chart grouped by ${group}`}>{chart.map(point => <div className="test-chart-column" key={point.label} title={`${point.label}: ${point.views} views`}><div className="test-chart-bar" style={{ height: `${Math.max(point.views ? 5 : 1, point.views / max * 100)}%` }} /><span>{point.label.slice(5)}</span></div>)}</div><p>Views = profile visits + launch-detail views. Feed impressions are separate; contact actions and saves/likes remain separate totals.</p></section>
    <div className="test-dashboard-grid"><section className="test-workspace-card"><h2>Your launches</h2>{data?.launches.length ? <ul className="test-analytics-list">{data.launches.map(item => <li key={item.id}><Link to={`/test/launch/${item.slug}`}>{item.title}</Link><strong>{item.views} views</strong></li>)}</ul> : <p className="test-muted">No launch-view events yet.</p>}{data?.bestLaunch && <p>Best-performing launch: <strong>{data.bestLaunch.title}</strong></p>}</section><section className="test-workspace-card"><h2>Traffic sources</h2>{data?.sources.length ? <ul className="test-analytics-list">{data.sources.map(item => <li key={item.source}><span>{item.source}</span><strong>{item.count}</strong></li>)}</ul> : <p className="test-muted">Traffic-source data will appear as synthetic preview visits occur.</p>}<p>Website click-through rate from Aarambh: <strong>{data?.websiteConversion ?? 0}%</strong></p><p className="test-muted">Website click-through rate is website clicks divided by profile visits plus launch-detail views. Sales are not tracked.</p></section></div>
    <section className="test-workspace-card"><div className="test-section-heading"><h2>Business actions</h2><span>Private aggregate counts</span></div><div className="test-metric-grid test-metric-grid-small">{[['Call clicks', totals.calls], ['Email clicks', totals.emails], ['Directions', totals.directions], ['Quote requests', totals.quoteRequests], ['Demo bookings', totals.demoBookings], ['Store visits', totals.storeVisits], ['Product clicks', totals.productClicks]].map(([label, value]) => <article className="test-metric-card" key={String(label)}><span>{label}</span><strong>{value ?? 0}</strong></article>)}</div>{data?.bestProduct && <p>Best-performing product: <strong>{data.bestProduct.name}</strong> · {data.bestProduct.clicks} clicks</p>}</section>
  </section>
}

type OwnedProfileBrand = Record<string, unknown> & {
  id: string
  name: string
  logoUrl?: string
  coverImageUrl?: string | null
  galleryImageUrls?: string[]
  openingHours?: unknown
  description?: string
  tagline?: string
  category?: string
  status?: string
  moderationLocked?: boolean
}

type ProfileCategory = { id: string; name: string; slug?: string }

async function uploadProfileImage(file: File, purpose: 'brand-logo' | 'founder-avatar') {
  const form = new FormData()
  form.set('purpose', purpose)
  form.set('file', file)
  const result = await api<{ asset: { id: string; url: string } }>('/uploads', { method: 'POST', body: form })
  return result.asset
}

function businessFieldsFrom(brand: OwnedProfileBrand) {
  return Object.fromEntries([
    'name', 'logoUrl', 'description', 'category', 'websiteUrl', 'instagramUrl', 'whatsappUrl', 'tagline',
    'city', 'state', 'foundedYear', 'area', 'address', 'latitude', 'longitude', 'contactPhone', 'contactEmail',
    'quoteUrl', 'demoUrl', 'storeUrl', 'businessMode'
  ].map(key => [key, String(brand[key] ?? (key === 'businessMode' ? 'online' : ''))])) as Record<string, string>
}

function businessMediaPreviewFrom(brand: OwnedProfileBrand) {
  const gallery = brand.galleryImageUrls
  const galleryUrls = Array.isArray(gallery) ? gallery.map(String).join('\n') : ''
  return { coverUrl: String(brand.coverImageUrl || ''), galleryUrls }
}
export function BusinessProfileEditorPage({ user }: { user: User | null }) {
  const [brands, setBrands] = useState<OwnedProfileBrand[]>([])
  const [categories, setCategories] = useState<ProfileCategory[]>([])
  const [selected, setSelected] = useState('')
  const [form, setForm] = useState<Record<string, string>>({})
  const [hours, setHours] = useState<HoursState>({})
  const [notice, setNotice] = useState('')
  const [noticeIsError, setNoticeIsError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mediaPreview, setMediaPreview] = useState({ coverUrl: '', galleryUrls: '' })
  const logoInput = useRef<HTMLInputElement | null>(null)
  const selectedBrand = brands.find(item => item.id === selected) || null

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let active = true
    setLoading(true)
    void api<{ items: OwnedProfileBrand[] }>('/me/brands').then(result => {
      if (!active) return
      setBrands(result.items)
      const chosen = result.items.find(item => item.id === selected) || result.items[0]
      if (chosen) {
        setSelected(chosen.id)
        setForm(businessFieldsFrom(chosen))
        setHours(normalizeHours(chosen.openingHours))
        setMediaPreview(businessMediaPreviewFrom(chosen))
      }
    }).catch(err => { if (active) { setNotice(message(err)); setNoticeIsError(true) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user?.id])

  useEffect(() => {
    if (!user) return
    let active = true
    void api<{ categories: ProfileCategory[] }>('/categories').then(result => { if (active) setCategories(result.categories) }).catch(err => {
      if (active) { setNotice(message(err)); setNoticeIsError(true) }
    })
    return () => { active = false }
  }, [user?.id])

  function set(key: string, value: string) { setForm(old => ({ ...old, [key]: value })) }
  function chooseBrand(id: string) {
    const chosen = brands.find(item => item.id === id)
    if (!chosen) return
    setSelected(id)
    setForm(businessFieldsFrom(chosen))
    setHours(normalizeHours(chosen.openingHours))
    setMediaPreview(businessMediaPreviewFrom(chosen))
    setNotice('')
  }
  async function uploadLogo(file?: File) {
    if (!file) return
    setUploading(true)
    setNotice('')
    try {
      const asset = await uploadProfileImage(file, 'brand-logo')
      set('logoUrl', asset.url)
      setNotice('Business logo uploaded to temporary preview storage. Save the profile to attach it.')
      setNoticeIsError(false)
    } catch (err) { setNotice(message(err)); setNoticeIsError(true) }
    finally { setUploading(false); if (logoInput.current) logoInput.current.value = '' }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setNotice(''); setNoticeIsError(false)
    try {
      const brand = brands.find(item => item.id === selected)
      if (!brand) throw new Error('Choose a business.')
      const coverImageUrl = validateProfileImageUrl(mediaPreview.coverUrl, 'Cover image')
      const galleryImageUrls = parseBusinessGallery(mediaPreview.galleryUrls)
      const stringFields = ['name', 'logoUrl', 'description', 'category', 'websiteUrl', 'instagramUrl', 'whatsappUrl', 'tagline', 'city', 'state', 'area', 'address', 'contactPhone', 'contactEmail', 'quoteUrl', 'demoUrl', 'storeUrl']
      const payload: Record<string, unknown> = { businessMode: form.businessMode || 'online', openingHours: hours, coverImageUrl: coverImageUrl || null, galleryImageUrls }
      for (const key of stringFields) if (form[key]?.trim()) payload[key] = form[key].trim()
      if (form.foundedYear.trim()) payload.foundedYear = Number(form.foundedYear)
      const latitude = Number(form.latitude), longitude = Number(form.longitude)
      if (form.latitude.trim() && Number.isFinite(latitude)) payload.latitude = latitude
      if (form.longitude.trim() && Number.isFinite(longitude)) payload.longitude = longitude
      const result = await api<{ item: OwnedProfileBrand }>(`/me/brands/${selected}`, { method: 'PATCH', body: body({ brand: payload }) })
      const updatedBrand: OwnedProfileBrand = result.item?.id === selected ? result.item : { ...brand, ...payload, openingHours: hours }
      setBrands(old => old.map(item => item.id === selected ? { ...item, ...updatedBrand } : item))
      setMediaPreview(businessMediaPreviewFrom(updatedBrand))
      setNotice('Business profile and weekly hours saved. Open-now discovery uses Asia/Kolkata.')
    } catch (err) { setNotice(message(err)); setNoticeIsError(true) }
    finally { setBusy(false) }
  }
  async function publish() {
    if (!selected || selectedBrand?.moderationLocked) return
    setBusy(true); setNotice(''); setNoticeIsError(false)
    try {
      const result = await api<{ item: OwnedProfileBrand }>(`/me/brands/${selected}/publish`, { method: 'POST' })
      if (result.item?.id === selected) setBrands(old => old.map(item => item.id === selected ? result.item : item))
      setNotice('Business profile published.')
    } catch (err) { setNotice(message(err)); setNoticeIsError(true) }
    finally { setBusy(false) }
  }
  const location = [form.address, form.area, form.city, form.state].filter(Boolean).join(', ')
  const businessProfileDirty = Boolean(selectedBrand) && (JSON.stringify(form) !== JSON.stringify(businessFieldsFrom(selectedBrand!)) || JSON.stringify(hours) !== JSON.stringify(normalizeHours(selectedBrand!.openingHours)) || JSON.stringify(mediaPreview) !== JSON.stringify(businessMediaPreviewFrom(selectedBrand!)))
  const configuredDays = Object.keys(hours).length
  const categoryName = categories.find(item => item.id === form.category)?.name || form.category
  const status = String(selectedBrand?.status || 'draft').replaceAll('_', ' ')
  const coverPreviewUrl = profilePreviewImageUrl(mediaPreview.coverUrl)
  const galleryPreviewUrls = mediaPreview.galleryUrls.split(/\r?\n/u).map(profilePreviewImageUrl).filter(Boolean).slice(0, 6)
  const verifiedBusiness = selectedBrand?.verified === true || selectedBrand?.verificationStatus === 'verified'
  const renderPreview = (expanded = false) => <article className={`test-profile-live-card test-business-live-card ${expanded ? 'is-expanded' : ''}`}>
    <div className="test-business-live-cover" aria-label="Business cover image preview">
      {coverPreviewUrl ? <img src={coverPreviewUrl} alt={`${form.name || 'Business'} cover preview`} /> : <span>Choose a cover image to preview your story</span>}
      <span className="test-business-cover-label">COVER · PREVIEW</span>
    </div>
    <div className="test-business-live-gallery" aria-label="Business gallery preview">
      {galleryPreviewUrls.length ? galleryPreviewUrls.map((url, index) => <img key={`${url}-${index}`} src={url} alt={`${form.name || 'Business'} gallery preview ${index + 1}`} />) : <span>Add image URLs to preview your gallery.</span>}
    </div>
    <div className="test-business-live-content">
      {form.logoUrl ? <img className="test-business-live-logo" src={form.logoUrl} alt={`${form.name || 'Business'} logo preview`} /> : <span className="test-business-live-logo is-empty" aria-hidden="true">{form.name?.trim().slice(0, 1).toUpperCase() || 'A'}</span>}
      <div className="test-business-live-tags">{categoryName && <span>{categoryName}</span>}<span>{form.businessMode || 'online'}</span></div>
      <h2>{form.name || 'Your business name'}</h2>
      <div className={`test-business-verification-panel ${verifiedBusiness ? 'is-verified' : 'is-preview'}`} aria-label={verifiedBusiness ? 'Verified business badge' : 'Verified business badge design preview'}>
        <span className="test-verification-mark" aria-hidden="true">✓</span>
        <div><strong>Verified business</strong><span>{verifiedBusiness ? 'Verified by Aarambh' : 'Badge design preview'}</span></div>
        {!verifiedBusiness && <p>Illustrative only. Aarambh reviews verification; this editor cannot award a badge.</p>}
      </div>
      <p className="test-business-live-tagline">{form.tagline || 'Your short introduction will appear here.'}</p>
      <p>{form.description || 'Add a description to introduce your business and what makes it distinct.'}</p>
      {location && <p className="test-business-live-location">{location}</p>}
      {form.foundedYear && <p className="test-business-live-location">Founded {form.foundedYear}</p>}
      <div className="test-business-live-links">{[
        ['Website', form.websiteUrl], ['Instagram', form.instagramUrl], ['WhatsApp', form.whatsappUrl],
        ['Quote', form.quoteUrl], ['Demo', form.demoUrl], ['Store', form.storeUrl],
        ['Call', form.contactPhone], ['Email', form.contactEmail]
      ].filter(([, href]) => href).map(([label]) => <span key={label}>{label}</span>)}</div>
      {configuredDays > 0 && <p className="test-business-live-location">Hours set for {configuredDays} day{configuredDays === 1 ? '' : 's'} · India time</p>}
      <small>Live preview · save edits before publishing.</small>
    </div>
  </article>

  if (!user) return <section className="test-content-width test-feature-page"><Heading eyebrow="OWNER PROFILE" title="Business profile" /><Notice><Link to="/test/account">Sign in to edit a business profile.</Link></Notice></section>
  return <section className="test-content-width test-feature-page test-profile-editor test-business-editor">
    <Heading eyebrow="OWNER WORKSPACE" title="Business profile" description="Shape how customers discover your business: identity, story, location, contact options, and weekly hours. Changes stay in draft until you publish them." />
    {loading ? <Notice>Loading your business profiles…</Notice> : brands.length ? <div className="test-profile-editor-layout">
      <form className="test-workspace-card test-profile-form test-business-profile-form" onSubmit={event => void submit(event)}>
        <div className="test-profile-card-header"><div><span className="test-eyebrow">BUSINESS EDITOR</span><h2>{selectedBrand?.name || 'Your business'}</h2></div><span className={`test-profile-status is-${status.replaceAll(' ', '-')}`}>{status}</span></div>
        {brands.length > 1 && <label className="test-field"><span>Business</span><select value={selected} onChange={event => chooseBrand(event.target.value)}>{brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        <section className="test-profile-editor-section"><div className="test-profile-section-heading"><span>01</span><div><h3>Identity &amp; story</h3><p>Give people a clear first impression.</p></div></div>
          <label className="test-field"><span>Business name</span><input required maxLength={100} value={form.name || ''} onChange={event => set('name', event.target.value)} /></label>
          <div className="test-form-grid"><label className="test-field"><span>Category</span><select value={form.category || ''} onChange={event => set('category', event.target.value)}><option value="">Choose a category</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="test-field"><span>Tagline</span><input maxLength={160} value={form.tagline || ''} onChange={event => set('tagline', event.target.value)} placeholder="A short introduction" /></label></div>
          <label className="test-field"><span>Business description</span><textarea rows={4} maxLength={1000} value={form.description || ''} onChange={event => set('description', event.target.value)} placeholder="Tell customers what your business does." /><small aria-live="polite">{(form.description || '').length}/1000</small></label>
          <div className="test-profile-upload-row">{form.logoUrl ? <img src={form.logoUrl} alt="Current business logo" /> : <span className="test-profile-upload-placeholder">{form.name?.slice(0, 1).toUpperCase() || 'B'}</span>}<div><strong>Business logo</strong><p>Upload a JPEG, PNG, or WebP image up to 5 MiB.</p><input ref={logoInput} className="test-profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose business logo" onChange={event => void uploadLogo(event.target.files?.[0])} /><button type="button" className="test-button test-button-secondary" disabled={uploading} onClick={() => logoInput.current?.click()}>{uploading ? 'Uploading…' : form.logoUrl ? 'Replace logo' : 'Upload logo'}</button></div></div>
        </section>
        <section className="test-profile-editor-section"><div className="test-profile-section-heading"><span>02</span><div><h3>Cover &amp; gallery</h3><p>Shape the imagery in your public profile preview.</p></div></div>
          <label className="test-field"><span>Cover image URL</span><input type="text" inputMode="url" maxLength={2048} value={mediaPreview.coverUrl} onChange={event => setMediaPreview(old => ({ ...old, coverUrl: event.target.value }))} placeholder="https://example.invalid/cover.webp or /images/cover.webp" /><small>Use an HTTPS image URL or a bundled /images/ path. Leave blank to clear.</small></label>
          <label className="test-field"><span>Gallery image URLs (one per line)</span><textarea rows={3} maxLength={12300} value={mediaPreview.galleryUrls} onChange={event => setMediaPreview(old => ({ ...old, galleryUrls: event.target.value }))} placeholder="https://example.invalid/image.webp" /><small>Up to 6 unique URLs; each URL may be up to 2,048 characters.</small></label>
        </section>
        <section className="test-profile-editor-section"><div className="test-profile-section-heading"><span>03</span><div><h3>Location &amp; hours</h3><p>Set the public location and how customers can visit.</p></div></div>
          <div className="test-form-grid">{[['city', 'City'], ['state', 'State'], ['area', 'Area / neighbourhood'], ['address', 'Public address']].map(([key, label]) => <label className="test-field" key={key}><span>{label}</span><input maxLength={key === 'address' ? 300 : key === 'area' ? 100 : 80} value={form[key] || ''} onChange={event => set(key, event.target.value)} /></label>)}
            <label className="test-field"><span>Founded year</span><input type="number" min={1800} max={new Date().getFullYear()} step={1} value={form.foundedYear || ''} onChange={event => set('foundedYear', event.target.value)} /></label>
            <label className="test-field"><span>Operating type</span><select value={form.businessMode || 'online'} onChange={event => set('businessMode', event.target.value)}><option value="online">Online</option><option value="physical">Physical</option><option value="hybrid">Hybrid</option></select></label>
            <label className="test-field"><span>Latitude</span><input type="number" min={-90} max={90} step="any" value={form.latitude || ''} onChange={event => set('latitude', event.target.value)} /></label>
            <label className="test-field"><span>Longitude</span><input type="number" min={-180} max={180} step="any" value={form.longitude || ''} onChange={event => set('longitude', event.target.value)} /></label>
          </div>
          <OpeningHoursEditor value={hours} onChange={setHours} />
          <p className="test-muted">Set each day to open, closed, or not set. Open-now discovery evaluates these hours in Asia/Kolkata.</p>
        </section>
        <section className="test-profile-editor-section"><div className="test-profile-section-heading"><span>04</span><div><h3>Contact &amp; links</h3><p>Give people a direct path to your business.</p></div></div>
          <div className="test-form-grid">{[['contactPhone', 'Public phone'], ['contactEmail', 'Public contact email'], ['websiteUrl', 'Website (HTTPS)'], ['instagramUrl', 'Instagram (HTTPS)'], ['whatsappUrl', 'WhatsApp link (HTTPS)'], ['quoteUrl', 'Request a quote (HTTPS)'], ['demoUrl', 'Book a demo (HTTPS)'], ['storeUrl', 'Visit store (HTTPS)']].map(([key, label]) => <label className="test-field" key={key}><span>{label}</span><input type={key.endsWith('Url') ? 'url' : key === 'contactEmail' ? 'email' : key === 'contactPhone' ? 'tel' : 'text'} pattern={key.endsWith('Url') ? 'https://.+' : key === 'contactPhone' ? '\\+?[0-9 \\(\\)\\-]{7,25}' : undefined} title={key.endsWith('Url') ? 'Use a valid HTTPS URL.' : key === 'contactPhone' ? 'Use 7–25 characters: digits, spaces, parentheses, hyphens, and an optional leading +.' : undefined} maxLength={key === 'contactPhone' ? 25 : key === 'contactEmail' ? 254 : undefined} value={form[key] || ''} onChange={event => set(key, event.target.value)} placeholder={key.endsWith('Url') ? 'https://sample.invalid/…' : ''} /></label>)}</div>
        </section>
        <div className="test-profile-form-actions"><button type="submit" className="test-button test-button-primary" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save profile'}</button><Link className="test-inline-link" to="/test/workspace">Founder workspace</Link></div>
        {notice && <Notice error={noticeIsError}>{notice}</Notice>}
      </form>
      <aside className="test-profile-editor-aside"><div className="test-profile-aside-heading"><span className="test-eyebrow">LIVE PREVIEW</span><h2>Your public business card</h2><p>Preview reflects current edits. Save before you publish.</p></div>{renderPreview()}
        <div className="test-profile-publish-panel"><span className={`test-profile-status is-${status.replaceAll(' ', '-')}`}>{status}</span><p>{status === 'published' ? 'Your business is visible on the public discovery pages.' : businessProfileDirty ? 'Save your latest edits before publishing.' : 'Your changes are private until you publish the business.'}</p>
          <div className="test-profile-control-row"><button type="button" className="test-button test-button-secondary" onClick={() => setPreviewOpen(true)}>Preview profile</button><button type="button" className="test-button test-button-primary" disabled={busy || uploading || businessProfileDirty || status === 'published' || Boolean(selectedBrand?.moderationLocked)} onClick={() => void publish()}>{busy ? 'Working…' : status === 'published' ? 'Published' : businessProfileDirty ? 'Save changes first' : 'Publish business'}</button></div>
          {selectedBrand?.moderationLocked && <p className="test-muted">This business is locked and cannot be published from this editor.</p>}
        </div>
      </aside>
      {previewOpen && <div className="test-profile-modal" role="dialog" aria-modal="true" aria-label="Business profile preview"><div className="test-profile-modal-card"><div className="test-profile-modal-heading"><strong>Business profile preview</strong><button type="button" className="test-button test-button-secondary" onClick={() => setPreviewOpen(false)}>Close preview</button></div>{renderPreview(true)}</div></div>}
    </div> : <Notice>Create a business in the <Link to="/test/workspace">founder workspace</Link> first.</Notice>}
  </section>
}

export function FounderProfileEditorPage({ user }: { user: User | null }) {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [ownedBrands, setOwnedBrands] = useState<OwnedProfileBrand[]>([])
  const [fields, setFields] = useState({ displayName: '', avatarUrl: '', bio: '', city: '', state: '', role: '', pronouns: '', interests: '', instagramUrl: '', publicProfile: true, publicBrandIds: [] as string[] })
  const [notice, setNotice] = useState('')
  const [noticeIsError, setNoticeIsError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const avatarInput = useRef<HTMLInputElement | null>(null)
  const publishedBrands = ownedBrands.filter(brand => brand.status === 'published')
  const unavailableLinks = fields.publicBrandIds.filter(id => !publishedBrands.some(brand => brand.id === id))
  const verifiedFounder = profile?.verified === true || profile?.verificationStatus === 'verified'

  useEffect(() => {
    if (!user) { setLoading(false); return }
    let active = true
    setLoading(true)
    void Promise.all([
      api<{ item: Record<string, unknown> | null }>('/me/founder-profile'),
      api<{ items: OwnedProfileBrand[] }>('/me/brands')
    ]).then(([result, brandResult]) => {
      if (!active) return
      setProfile(result.item)
      setOwnedBrands(brandResult.items)
      if (result.item) setFields({
        displayName: String(result.item.displayName || ''), avatarUrl: String(result.item.avatarUrl || ''), bio: String(result.item.bio || ''),
        city: String(result.item.city || ''), state: String(result.item.state || ''), role: String(result.item.role || ''),
        pronouns: String(result.item.pronouns || ''), interests: Array.isArray(result.item.interests) ? result.item.interests.map(String).join(', ') : String(result.item.interests || ''),
        instagramUrl: String(result.item.instagramUrl || ''), publicProfile: Boolean(result.item.publicProfile),
        publicBrandIds: Array.isArray(result.item.publicBrandIds) ? result.item.publicBrandIds.map(String) : []
      })
    }).catch(err => { if (active) { setNotice(message(err)); setNoticeIsError(true) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user?.id])

  function set(key: 'displayName' | 'avatarUrl' | 'bio' | 'city' | 'state' | 'role' | 'pronouns' | 'interests' | 'instagramUrl', value: string) { setFields(old => ({ ...old, [key]: value })) }
  function toggleBrand(id: string, checked: boolean) {
    setFields(old => ({ ...old, publicBrandIds: checked ? [...old.publicBrandIds, id] : old.publicBrandIds.filter(item => item !== id) }))
  }
  async function uploadAvatar(file?: File) {
    if (!file) return
    setUploading(true); setNotice('')
    try {
      const asset = await uploadProfileImage(file, 'founder-avatar')
      set('avatarUrl', asset.url)
      setNotice('Founder portrait uploaded to temporary preview storage. Save the profile to attach it.')
      setNoticeIsError(false)
    } catch (err) { setNotice(message(err)); setNoticeIsError(true) }
    finally { setUploading(false); if (avatarInput.current) avatarInput.current.value = '' }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(''); setNoticeIsError(false)
    try {
      const payload = {
        displayName: fields.displayName, avatarUrl: fields.avatarUrl, bio: fields.bio, city: fields.city, state: fields.state,
        role: fields.role, pronouns: fields.pronouns.trim() || null, interests: parseFounderInterests(fields.interests),
        instagramUrl: fields.instagramUrl, publicProfile: fields.publicProfile,
        publicBrandIds: fields.publicBrandIds.filter(id => publishedBrands.some(brand => brand.id === id))
      }
      const result = await api<{ item: Record<string, unknown> }>('/me/founder-profile', { method: 'PATCH', body: body({ profile: payload }) })
      setProfile(result.item)
      setFields(old => ({ ...old, pronouns: String(result.item.pronouns || ''), interests: Array.isArray(result.item.interests) ? result.item.interests.map(String).join(', ') : '' }))
      setNotice('Founder profile updated.')
    } catch (err) { setNotice(message(err)); setNoticeIsError(true) }
    finally { setBusy(false) }
  }
  const renderPreview = (expanded = false) => <article className={`test-profile-live-card test-founder-live-card ${expanded ? 'is-expanded' : ''}`}>
    <div className="test-founder-live-top"><span className="test-founder-live-label">FOUNDER PROFILE</span><span className={`test-profile-status ${fields.publicProfile ? 'is-public' : 'is-private'}`}>{fields.publicProfile ? 'Public' : 'Private'}</span></div>
    <div className="test-founder-live-identity">{fields.avatarUrl ? <img className="test-founder-live-avatar" src={fields.avatarUrl} alt={`${fields.displayName || 'Founder'} portrait preview`} /> : <span className="test-founder-live-avatar is-empty" aria-hidden="true">{fields.displayName.trim().slice(0, 1).toUpperCase() || 'F'}</span>}
      <div><h2>{fields.displayName || 'Your name'}</h2><p>{[fields.role || 'Founder', fields.pronouns].filter(Boolean).join(' · ')}</p></div></div>
    <div className={`test-founder-verification-panel ${verifiedFounder ? 'is-verified' : 'is-preview'}`} aria-label={verifiedFounder ? 'Verified founder badge' : 'Verified founder badge design preview'}>
      <span className="test-verification-mark" aria-hidden="true">✓</span>
      <div><strong>Verified founder</strong><span>{verifiedFounder ? 'Verified by Aarambh' : 'Badge design preview'}</span></div>
      {!verifiedFounder && <p>Illustrative only. Aarambh reviews verification; this editor cannot award a badge.</p>}
    </div>
    <p className="test-founder-live-bio">{fields.bio || 'Your founder story will appear here.'}</p>
    {fields.interests.split(',').map(item => item.trim()).filter(Boolean).length > 0 && <div className="test-founder-live-interests" aria-label="Founder interests">{fields.interests.split(',').map(item => item.trim()).filter(Boolean).slice(0, 8).map(interest => <span key={interest}>{interest}</span>)}</div>}
    {(fields.city || fields.state) && <p className="test-business-live-location">{[fields.city, fields.state].filter(Boolean).join(', ')}</p>}
    {fields.instagramUrl && <a className="test-founder-live-social" href={fields.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram profile ↗</a>}
    <div className="test-founder-live-brands"><span className="test-eyebrow">LINKED BUSINESSES</span>{fields.publicProfile && fields.publicBrandIds.length ? fields.publicBrandIds.map(id => {
      const brand = ownedBrands.find(item => item.id === id)
      return brand && brand.status === 'published' ? <span className="test-founder-live-brand" key={id}>{brand.name}</span> : null
    }) : <p>{fields.publicProfile ? 'No public businesses linked yet.' : 'Your linked businesses are hidden while this profile is private.'}</p>}</div>
  </article>

  if (!user) return <section className="test-content-width test-feature-page"><Heading eyebrow="FOUNDER PROFILE" title="Update your profile" /><Notice><Link to="/test/account">Sign in to edit your founder profile.</Link></Notice></section>
  return <section className="test-content-width test-feature-page test-profile-editor test-founder-editor">
    <Heading eyebrow="FOUNDER WORKSPACE" title="Founder profile" description="Make your public founder introduction feel like you. Your account email stays private." />
    {loading ? <Notice>Loading your founder profile…</Notice> : profile ? <div className="test-profile-editor-layout">
      <form className="test-workspace-card test-profile-form test-founder-profile-form" onSubmit={event => void submit(event)}>
        <div className="test-profile-card-header"><div><span className="test-eyebrow">PROFILE EDITOR</span><h2>About you</h2></div><span className={`test-profile-status ${fields.publicProfile ? 'is-public' : 'is-private'}`}>{fields.publicProfile ? 'Public profile' : 'Private profile'}</span></div>
        <section className="test-profile-editor-section"><div className="test-profile-section-heading"><span>01</span><div><h3>Your identity</h3><p>Set your name, role, and public portrait.</p></div></div>
          <label className="test-field"><span>Display name</span><input required maxLength={80} value={fields.displayName} onChange={event => set('displayName', event.target.value)} /><small aria-live="polite">{fields.displayName.length}/80</small></label>
          <div className="test-form-grid"><label className="test-field"><span>Role</span><input maxLength={80} value={fields.role} onChange={event => set('role', event.target.value)} placeholder="Founder, designer, maker…" /></label><label className="test-field"><span>Pronouns</span><input maxLength={40} value={fields.pronouns} onChange={event => set('pronouns', event.target.value)} placeholder="e.g. she/her" /><small>{fields.pronouns.length}/40</small></label><label className="test-field"><span>City</span><input maxLength={80} value={fields.city} onChange={event => set('city', event.target.value)} /></label><label className="test-field"><span>State</span><input maxLength={80} value={fields.state} onChange={event => set('state', event.target.value)} /></label></div>
          <div className="test-profile-upload-row">{fields.avatarUrl ? <img className="is-round" src={fields.avatarUrl} alt="Current founder portrait" /> : <span className="test-profile-upload-placeholder is-round">{fields.displayName.trim().slice(0, 1).toUpperCase() || 'F'}</span>}<div><strong>Portrait</strong><p>Upload a JPEG, PNG, or WebP image up to 5 MiB.</p><input ref={avatarInput} className="test-profile-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose founder portrait" onChange={event => void uploadAvatar(event.target.files?.[0])} /><button type="button" className="test-button test-button-secondary" disabled={uploading} onClick={() => avatarInput.current?.click()}>{uploading ? 'Uploading…' : fields.avatarUrl ? 'Replace portrait' : 'Upload portrait'}</button></div></div>
        </section>
        <section className="test-profile-editor-section"><div className="test-profile-section-heading"><span>02</span><div><h3>Your story</h3><p>Tell visitors what you are building and why.</p></div></div>
          <label className="test-field"><span>Short bio</span><textarea rows={5} maxLength={500} value={fields.bio} onChange={event => set('bio', event.target.value)} /><small aria-live="polite">{fields.bio.length}/500</small></label>
          <label className="test-field"><span>Interests</span><textarea rows={2} maxLength={240} value={fields.interests} onChange={event => set('interests', event.target.value)} placeholder="Ceramics, slow design, textiles" /><small>Separate up to 8 interests with commas; each may be up to 40 characters (240 characters total).</small></label>
          <label className="test-field"><span>Instagram profile (HTTPS)</span><input type="url" pattern="https://.+" title="Use a valid HTTPS URL." value={fields.instagramUrl} onChange={event => set('instagramUrl', event.target.value)} placeholder="https://instagram.com/…" /></label>
        </section>
        <section className="test-profile-editor-section"><div className="test-profile-section-heading"><span>03</span><div><h3>Linked businesses</h3><p>Choose published businesses that should appear with your founder profile.</p></div></div>
          {publishedBrands.length ? <fieldset className="test-founder-business-picker"><legend>Public businesses</legend>{publishedBrands.map(brand => <label className="test-check" key={brand.id}><input type="checkbox" checked={fields.publicBrandIds.includes(brand.id)} disabled={!fields.publicBrandIds.includes(brand.id) && fields.publicBrandIds.length >= 50} onChange={event => toggleBrand(brand.id, event.target.checked)} /><span>{brand.name}</span></label>)}</fieldset> : <p className="test-profile-empty-links">Publish a business first to link it to your public founder profile.</p>}
          {unavailableLinks.length > 0 && <p className="test-profile-link-warning">{unavailableLinks.length} previously linked business{unavailableLinks.length === 1 ? ' is' : 'es are'} no longer published. Those links will be removed when you save.</p>}
        </section>
        <section className="test-profile-editor-section"><div className="test-profile-section-heading"><span>04</span><div><h3>Visibility</h3><p>Control whether this founder introduction is public.</p></div></div><label className="test-check test-founder-visibility"><input type="checkbox" checked={fields.publicProfile} onChange={event => setFields(old => ({ ...old, publicProfile: event.target.checked }))} /><span>Show public founder profile</span></label></section>
        <div className="test-profile-form-actions"><button type="submit" className="test-button test-button-primary" disabled={busy || uploading || !fields.displayName.trim()}>{busy ? 'Saving…' : 'Save founder profile'}</button><button type="button" className="test-button test-button-secondary" onClick={() => setPreviewOpen(true)}>Preview profile</button></div>
        {notice && <Notice error={noticeIsError}>{notice}</Notice>}
      </form>
      <aside className="test-profile-editor-aside"><div className="test-profile-aside-heading"><span className="test-eyebrow">LIVE PREVIEW</span><h2>Your public founder card</h2><p>Preview reflects current edits and visibility.</p></div>{renderPreview()}</aside>
      {previewOpen && <div className="test-profile-modal" role="dialog" aria-modal="true" aria-label="Founder profile preview"><div className="test-profile-modal-card"><div className="test-profile-modal-heading"><strong>Founder profile preview</strong><button type="button" className="test-button test-button-secondary" onClick={() => setPreviewOpen(false)}>Close preview</button></div>{renderPreview(true)}</div></div>}
    </div> : <Notice>Create your founder profile in the <Link to="/test/workspace">founder workspace</Link> first.</Notice>}
  </section>
}
