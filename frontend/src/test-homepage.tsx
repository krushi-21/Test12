import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, Bell, Bookmark, CalendarDays, Compass, Home, MapPin, Search, Sparkles, Store, TrendingUp, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FollowTarget } from './test-features'
import './test-homepage.css'

type Category = { id: string; name: string; slug: string }
type Founder = { id: string; slug?: string; displayName: string; avatarUrl?: string }
type Launch = {
  id: string; slug: string; title: string; launchType: string; category: string; summary?: string; story?: string
  images?: { url: string; altText: string }[]; brand: { id: string; slug: string; name: string; logoUrl?: string }
  founders?: Founder[]; location?: { city?: string; area?: string; state?: string }; launchAt?: string; publishedAt?: string
}
type Business = {
  id: string; slug: string; name: string; description?: string; tagline?: string; category?: string; city?: string; state?: string; area?: string
  distanceKm?: number; businessMode?: string; launchCount?: number; logoUrl?: string; interactions?: number
}
type PublicBusiness = Business & { founders?: Founder[]; launches?: Launch[] }
type ProfileViewer = { id: string; displayName: string; email: string; emailVerified: boolean }
type RankedLaunch = { rank: number; score: number; launch: Launch }
type RankedBusiness = { rank: number; score: number; business: Business }
type ApiPage<T> = { items: T[] }
type HomeFounder = { id: string; slug: string; displayName: string; bio?: string; city?: string; state?: string; role?: string; pronouns?: string; interests?: string[]; avatarUrl?: string; brands: Array<{ id: string; slug: string; name: string; category: string; city?: string; state?: string }> }
type PublicCollection = { id: string; name: string; description?: string; isPublic: boolean; shareUrl?: string; launchCount: number; launches: Launch[] }
type ApiError = { error?: { message?: string } }

const FOUNDER_PORTRAIT_FALLBACK = '/images/aarambh-home-hero.jpg'
type FounderPageArtwork = { src: string; altText: string; fallbackSrc?: string; fallbackAltText?: string }
const FOUNDER_LAUNCH_ARTWORK: Record<string, { src: string; altText: string }> = {
  'miti-handwoven-home-textiles': { src: '/images/launch-textile.jpg', altText: 'Textile stitching at an artisan work table' },
  'miti-woven-lighting': { src: '/images/launch-craft.webp', altText: 'A synthetic artisan craft collage with woven textiles and pottery' },
  'miti-artisan-tableware': { src: '/images/launch-ceramics.jpg', altText: 'Hand-thrown terracotta and ivory ceramic vessels displayed on linen' },
}

function founderPageArtwork(launch: Launch, launches: Launch[]): FounderPageArtwork {
  const image = launch.images?.find(candidate => candidate.url && !launches.some(other =>
    other.id !== launch.id && other.images?.some(otherImage => otherImage.url === candidate.url)))
  const fallback = FOUNDER_LAUNCH_ARTWORK[launch.slug]
  if (image) return {
    src: image.url,
    altText: image.altText || `Image for ${launch.title}`,
    fallbackSrc: fallback?.src,
    fallbackAltText: fallback?.altText,
  }
  return fallback || { src: '', altText: '' }
}

function FounderPageImage({ artwork, empty }: { artwork: FounderPageArtwork; empty: ReactNode }) {
  const [failedSource, setFailedSource] = useState('')
  const source = failedSource
    ? failedSource === artwork.src && artwork.fallbackSrc ? artwork.fallbackSrc : ''
    : artwork.src
  if (!source) return <>{empty}</>
  const usingFallback = Boolean(failedSource && source === artwork.fallbackSrc)
  return <img
    src={source}
    alt={usingFallback ? artwork.fallbackAltText || artwork.altText : artwork.altText}
    loading="lazy"
    onError={() => setFailedSource(source)}
  />
}

function FounderPortrait({ founder }: { founder: HomeFounder }) {
  const portraitSource = founder.avatarUrl || FOUNDER_PORTRAIT_FALLBACK
  const [failedSource, setFailedSource] = useState('')
  const source = !failedSource ? portraitSource
    : failedSource === portraitSource && portraitSource !== FOUNDER_PORTRAIT_FALLBACK ? FOUNDER_PORTRAIT_FALLBACK : ''
  return <span className="home-founder-avatar home-founder-avatar-large">
    {source
      ? <img src={source} alt={source === FOUNDER_PORTRAIT_FALLBACK ? 'Illustrative synthetic artisan portrait' : `${founder.displayName} profile image`} onError={() => setFailedSource(source)} />
      : <span aria-hidden="true">{founder.displayName.slice(0, 1)}</span>}
  </span>
}

function FounderBusinessLogo({ business }: { business: PublicBusiness }) {
  const [failed, setFailed] = useState(false)
  return business.logoUrl && !failed
    ? <img src={business.logoUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <Store size={20} aria-hidden="true" />
}

const cities = ['Ahmedabad', 'Bengaluru', 'Chennai', 'Delhi', 'Hyderabad', 'Jaipur', 'Kolkata', 'Mumbai', 'Pune', 'Surat']
const cityCenters: Record<string, [number, number]> = {
  Ahmedabad: [23.0225, 72.5714], Jaipur: [26.9124, 75.7873], Mumbai: [19.076, 72.8777], Delhi: [28.6139, 77.209],
  Bengaluru: [12.9716, 77.5946], Pune: [18.5204, 73.8567], Hyderabad: [17.385, 78.4867], Chennai: [13.0827, 80.2707], Kolkata: [22.5726, 88.3639], Surat: [21.1702, 72.8311]
}

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'include' })
  const payload = await response.json().catch(() => ({})) as T & ApiError
  if (!response.ok) throw new Error(payload.error?.message || `Request failed (${response.status}).`)
  return payload
}

function SectionHeading({ icon, eyebrow, title, href, label }: { icon: ReactNode; eyebrow: string; title: string; href?: string; label?: string }) {
  return <div className="home-section-heading">
    <div className="home-section-title"><span className="home-section-icon" aria-hidden="true">{icon}</span><div><span className="test-eyebrow">{eyebrow}</span><h2>{title}</h2></div></div>
    {href && <Link className="home-see-all" to={href}>{label || 'See all'} <ArrowUpRight size={15} aria-hidden="true" /></Link>}
  </div>
}

function LaunchCard({ launch, rank, score }: { launch: Launch; rank?: number; score?: number }) {
  const href = `/test/launch/${encodeURIComponent(launch.slug)}?source=search`
  return <article className="home-launch-card test-launch-card">
    <Link to={href} className="home-launch-image" aria-label={`Open ${launch.title}`}>
      {launch.images?.[0] ? <img src={launch.images[0].url} alt={launch.images[0].altText} loading="lazy" /> : <span className="home-image-fallback"><Sparkles size={22} aria-hidden="true" /></span>}
      {rank != null && <span className="home-rank">#{rank}</span>}
    </Link>
    <div className="home-launch-copy">
      <div className="home-card-kicker"><span>{launch.category}</span>{score != null && <span>{score} points</span>}</div>
      <h3><Link to={href}>{launch.title}</Link></h3>
      <p>{launch.summary || launch.story || 'A synthetic sample launch from an independent business.'}</p>
      <div className="home-card-meta"><Link to={`/test/brand/${encodeURIComponent(launch.brand.slug)}`}>{launch.brand.name}</Link><span>{[launch.location?.area, launch.location?.city].filter(Boolean).join(', ')}</span></div>
      <Link className="home-card-action" to={href}>Explore launch <ArrowRight size={15} aria-hidden="true" /></Link>
    </div>
  </article>
}

const HOME_BUSINESS_PHOTOS: Record<string, string> = {
  'arts-crafts': '/images/aarambh-home-hero.jpg',
  'food-beverage': '/images/launch-home.jpg',
  'fashion-accessories': '/images/launch-textile.jpg',
  'home-living': '/images/launch-saffron.jpg',
  'health-wellness': '/images/launch-derma.jpg',
  'technology-software': '/images/growth-maker.jpg',
}

function BusinessCard({ business, subtitle, featured = false }: { business: Business; subtitle?: string; featured?: boolean }) {
  const photo = business.logoUrl || (featured ? (business.category && HOME_BUSINESS_PHOTOS[business.category]) || '/images/growth-maker.jpg' : undefined)
  return <article className={`home-business-card ${featured ? 'home-business-card-featured' : ''}`}>
    <span className="home-business-mark">{photo ? <img src={photo} alt="" loading="lazy" /> : <Store size={19} aria-hidden="true" />}</span>
    <div className="home-business-copy"><span className="home-card-kicker">{business.category || 'Local business'}</span>
      <h3><Link to={`/test/brand/${encodeURIComponent(business.slug)}`}>{business.name}</Link></h3>
      <p>{business.tagline || business.description || [business.area, business.city, business.state].filter(Boolean).join(' · ') || 'Synthetic sample business'}</p>
      <div className="home-business-meta"><span>{[business.area, business.city].filter(Boolean).join(', ') || business.city || 'Across India'}</span>{business.distanceKm != null && <span>{business.distanceKm.toFixed(1)} km away</span>}{subtitle && <span>{subtitle}</span>}</div>
    </div>
    <Link className="home-business-arrow" to={`/test/brand/${encodeURIComponent(business.slug)}`} aria-label={`View ${business.name}`}><ArrowUpRight size={17} aria-hidden="true" /></Link>
  </article>
}

function EmptyMessage({ children }: { children: ReactNode }) { return <div className="home-empty-message">{children}</div> }

export function AarambhHomepage() {
  const [city, setCity] = useState('Ahmedabad')
  const [categories, setCategories] = useState<Category[]>([])
  const [popularCategories, setPopularCategories] = useState<Array<Category & { launchCount?: number }>>([])
  const [publicCollections, setPublicCollections] = useState<PublicCollection[]>([])
  const [trending, setTrending] = useState<RankedLaunch[]>([])
  const [newLaunches, setNewLaunches] = useState<Launch[]>([])
  const [nearby, setNearby] = useState<Business[]>([])
  const [rising, setRising] = useState<Business[]>([])
  const [upcoming, setUpcoming] = useState<Launch[]>([])
  const [monthlyBusinesses, setMonthlyBusinesses] = useState<RankedBusiness[]>([])
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({})
  const [categoryFilter, setCategoryFilter] = useState('')
  const [query, setQuery] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchLaunches, setSearchLaunches] = useState<Launch[]>([])
  const [searchBusinesses, setSearchBusinesses] = useState<Business[]>([])
  const [searchFounders, setSearchFounders] = useState<Founder[]>([])
  const [searchFounderError, setSearchFounderError] = useState('')

  useEffect(() => {
    let active = true
    const load = async <T,>(key: string, path: string, onData: (value: T) => void) => {
      try { const value = await api<T>(path); if (active) { onData(value); setSectionErrors(current => ({ ...current, [key]: '' })) } }
      catch (error) { if (active) setSectionErrors(current => ({ ...current, [key]: error instanceof Error ? error.message : 'This section could not be loaded.' })) }
    }
    void Promise.all([
      load<{ categories: Category[] }>('categories', '/categories', result => setCategories(result.categories)),
      load<{ categories: Array<Category & { launchCount?: number }> }>('popularCategories', '/categories/popular', result => setPopularCategories(result.categories)),
      load<ApiPage<PublicCollection>>('guides', '/collections/public?limit=6', result => setPublicCollections(result.items)),
      load<{ items: RankedLaunch[] }>('trending', '/trending?period=today&limit=8', result => setTrending(result.items)),
      load<{ items: Launch[] }>('upcoming', '/launches/upcoming?limit=4', result => setUpcoming(result.items)),
      load<{ risingBusinesses: Business[] }>('rising', '/trending/dashboard', result => setRising(result.risingBusinesses)),
      load<{ items: RankedBusiness[] }>('monthly', '/businesses/leaderboard?period=monthly', result => setMonthlyBusinesses(result.items))
    ])
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ limit: '12', sort: 'new', source: 'search' })
    if (city) params.set('city', city)
    if (categoryFilter) params.set('category', categoryFilter)
    void api<ApiPage<Launch>>(`/launches?${params.toString()}`)
      .then(result => { if (active) { setNewLaunches(result.items); setSectionErrors(current => ({ ...current, new: '' })) } })
      .catch(error => { if (active) setSectionErrors(current => ({ ...current, new: error instanceof Error ? error.message : 'New launches could not be loaded.' })) })
    return () => { active = false }
  }, [city, categoryFilter])

  useEffect(() => {
    let active = true
    const center = cityCenters[city] || cityCenters.Ahmedabad
    const params = new URLSearchParams({ city, sort: 'trending', limit: '6', latitude: String(center[0]), longitude: String(center[1]), radiusKm: '25' })
    if (categoryFilter) params.set('category', categoryFilter)
    void api<ApiPage<Business>>(`/discover/businesses?${params.toString()}`)
      .then(result => { if (active) { setNearby(result.items); setSectionErrors(current => ({ ...current, nearby: '' })) } })
      .catch(error => { if (active) setSectionErrors(current => ({ ...current, nearby: error instanceof Error ? error.message : 'Nearby businesses could not be loaded.' })) })
    return () => { active = false }
  }, [city, categoryFilter])

  async function submitSearch(event: FormEvent) {
    event.preventDefault()
    const term = query.trim()
    if (!term) return
    setSearchTerm(term); setSearchBusy(true); setSearchError(''); setSearchFounderError(''); setSearchLaunches([]); setSearchBusinesses([]); setSearchFounders([])
    const encoded = encodeURIComponent(term)
    const [launchResult, businessResult, founderResult] = await Promise.allSettled([
      api<ApiPage<Launch>>(`/launches?query=${encoded}&limit=12&sort=new&source=search`),
      api<ApiPage<Business>>(`/discover/businesses?query=${encoded}&limit=12&sort=most_liked`),
      api<ApiPage<Founder>>(`/founders?query=${encoded}`)
    ])
    const launches = launchResult.status === 'fulfilled' ? launchResult.value.items : []
    const businesses = businessResult.status === 'fulfilled' ? businessResult.value.items : []
    const founders = founderResult.status === 'fulfilled' ? founderResult.value.items : []
    if (launchResult.status === 'fulfilled') setSearchLaunches(launches)
    if (businessResult.status === 'fulfilled') setSearchBusinesses(businesses)
    if (founderResult.status === 'fulfilled') setSearchFounders(founders)
    else setSearchFounderError('Founder search is temporarily unavailable.')
    if ([launchResult, businessResult, founderResult].every(result => result.status === 'rejected')) setSearchError('Search is temporarily unavailable. Please try again.')
    setSearchBusy(false)
  }

  const locationQuery = (category?: string) => {
    const params = new URLSearchParams({ city })
    const selectedCategory = category || categoryFilter
    if (selectedCategory) params.set('category', selectedCategory)
    return `/test/nearby?${params.toString()}`
  }
  const sectionError = (key: string) => sectionErrors[key] ? <EmptyMessage>{sectionErrors[key]}</EmptyMessage> : null
  const heroCategories = (popularCategories.length ? popularCategories : categories).slice(0, 3)

  return <section className="test-homepage" aria-label="Aarambh homepage">
    <header className="home-site-header">
      <div className="home-topbar-inner">
        <Link className="home-wordmark" to="/test" aria-label="Aarambh home"><span className="home-brand-mark" aria-hidden="true" /><span>AARAMBH</span></Link>
        <form className="home-search" onSubmit={event => void submitSearch(event)} role="search" aria-label="Search Aarambh">
          <Search size={20} aria-hidden="true" />
          <label className="visually-hidden" htmlFor="home-unified-search">Search businesses, launches, and founders</label>
          <input id="home-unified-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search makers, products, categories, cities" />
          <button className="visually-hidden" type="submit" disabled={searchBusy}>{searchBusy ? 'Searching…' : 'Search'}</button>
        </form>
        <div className="home-header-tools">
          <label className="home-location-control home-header-city"><span className="visually-hidden">City</span><select aria-label="Choose your city" value={city} onChange={event => setCity(event.target.value)}>{cities.map(item => <option key={item}>{item}</option>)}</select></label>
          <Link className="home-account-link home-icon-link" to="/test/collections" aria-label="Saved collections"><Bookmark size={17} aria-hidden="true" /><span className="visually-hidden">Saved collections</span></Link>
          <Link className="home-account-link home-icon-link" to="/test/notifications" aria-label="Notifications"><Bell size={17} aria-hidden="true" /><span className="visually-hidden">Notifications</span></Link>
          <Link className="home-account-link home-avatar-link" to="/test/account" aria-label="Your account"><span className="home-avatar-monogram" aria-hidden="true">A</span><span className="visually-hidden">Your account</span></Link>
        </div>
      </div>
    </header>

    <div className="test-content-width">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <span className="home-hero-kicker">THE LOCAL DISCOVERY PLATFORM</span>
          <h1 id="home-title">Rooted in craft.<br />Made by India.</h1>
          <p>Meet the makers. Explore new launches. Support local.<br />Build a stronger India, together.</p>
          <div className="home-hero-actions"><Link to={locationQuery()} className="home-launch-cta">Explore makers <ArrowRight size={17} aria-hidden="true" /></Link><Link to={locationQuery()} className="home-secondary-cta">Browse nearby <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
          <div className="home-social-proof" aria-label="Discover independent makers close to home">
            <span className="home-proof-markers" aria-hidden="true"><span><Store size={14} /></span><span><Sparkles size={14} /></span><span><MapPin size={14} /></span></span>
            <p>Discover the makers behind the good things around you.</p>
          </div>
        </div>
        <div className="home-hero-visual"><img src="/images/aarambh-home-hero.jpg" alt="A maker shaping a ceramic bowl in her studio" /><span className="home-hero-badge">New in {city}</span><div className="home-maker-card"><span className="home-maker-card-eyebrow">MEET THE MAKER</span><strong>Independent maker · {city}</strong><span className="home-maker-card-meta"><i aria-hidden="true" />Handmade, with intention</span></div></div>
      </section>

      <div className="home-category-browse-row">
        <div className="home-category-browse-main"><span className="home-category-browse-label">Browse by category</span><div className="home-category-chips" aria-label="Browse by category">
          <button className={`home-category-chip ${categoryFilter ? '' : 'is-active'}`} type="button" aria-pressed={!categoryFilter} onClick={() => setCategoryFilter('')}>All categories</button>
          {heroCategories.map(item => <button className={`home-category-chip ${categoryFilter === item.id ? 'is-active' : ''}`} type="button" aria-pressed={categoryFilter === item.id} key={item.id} onClick={() => setCategoryFilter(current => current === item.id ? '' : item.id)}>{item.name}</button>)}
          <label className="home-filter-control"><span className="visually-hidden">More categories</span><select aria-label="Filter by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">More categories</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div></div>
        <Link className="home-founder-link" to="/test/workspace">Are you a maker? <span>Launch your business</span><ArrowUpRight size={15} aria-hidden="true" /></Link>
      </div>

      {searchTerm && <section className="home-search-results" aria-live="polite" aria-label="Search results">
        <div className="home-search-results-heading"><div><span className="test-eyebrow">AARAMBH SEARCH</span><h2>Results for “{searchTerm}”</h2></div><button type="button" onClick={() => { setSearchTerm(''); setSearchError('') }}>Clear search</button></div>
        {searchBusy && <EmptyMessage>Searching businesses, launches, and founders…</EmptyMessage>}
        {searchError && <EmptyMessage>{searchError}</EmptyMessage>}
        {!searchBusy && !searchError && <>
          <div className="home-search-result-group"><h3>Businesses <span>{searchBusinesses.length}</span></h3>{searchBusinesses.length ? <div className="home-business-list">{searchBusinesses.slice(0, 4).map(item => <BusinessCard key={item.id} business={item} />)}</div> : <p className="home-no-results">No matching businesses found.</p>}</div>
          <div className="home-search-result-group"><h3>Launches <span>{searchLaunches.length}</span></h3>{searchLaunches.length ? <div className="home-launch-grid home-search-launches">{searchLaunches.slice(0, 4).map(item => <LaunchCard key={item.id} launch={item} />)}</div> : <p className="home-no-results">No matching launches found.</p>}</div>
          <div className="home-search-result-group"><h3>Founders <span>{searchFounders.length}</span></h3><p className="home-founder-search-note">Searches public founder profiles directly, independently of business and launch matches.</p>{searchFounderError ? <p className="home-no-results">{searchFounderError}</p> : searchFounders.length ? <div className="home-founder-list">{searchFounders.map(founder => <Link to={`/test/founder/${encodeURIComponent(founder.slug || founder.id)}`} className="home-founder-card" key={founder.id}><span className="home-founder-avatar">{founder.avatarUrl ? <img src={founder.avatarUrl} alt="" /> : founder.displayName.slice(0, 1)}</span><span><small>FOUNDER</small><strong>{founder.displayName}</strong></span><ArrowUpRight size={16} aria-hidden="true" /></Link>)}</div> : <p className="home-no-results">No matching public founders found.</p>}</div>
        </>}
      </section>}

      <div className="home-discovery-layout">
        <div className="home-featured-grid">
          <section className="home-section home-section-trending" aria-label="Trending Today">
            <SectionHeading icon={<TrendingUp size={18} />} eyebrow="WHAT PEOPLE ARE NOTICING" title="Trending Today" href="/test/trending" label="View all" />
            {trending.length ? <div className="home-launch-grid home-trending-grid home-trending-cards home-trending-shelf" aria-label="Trending launches">{trending.slice(0, 4).map(item => <LaunchCard key={item.launch.id} launch={item.launch} rank={item.rank} score={item.score} />)}</div> : sectionError('trending') || <EmptyMessage>No trending launches in the synthetic preview yet.</EmptyMessage>}
          </section>

          <section className="home-section home-section-new" aria-label="New launches">
            <SectionHeading icon={<Sparkles size={18} />} eyebrow="JUST INTRODUCED" title="New Launches" href="/test/trending" label="View all" />
            {newLaunches.length ? <div className="home-launch-shelf" aria-label="Recently published launches">{newLaunches.slice(0, 8).map(item => <LaunchCard key={item.id} launch={item} />)}</div> : sectionError('new') || <EmptyMessage>No launches are currently available for these filters.</EmptyMessage>}
          </section>

          <section className="home-section home-section-nearby" aria-label="Popular nearby businesses">
            <SectionHeading icon={<MapPin size={18} />} eyebrow={`IN ${city.toUpperCase()}`} title="Popular Near You" href={locationQuery()} label="View all" />
            {nearby.length ? <div className="home-business-list">{nearby.slice(0, 4).map(item => <BusinessCard key={item.id} business={item} featured />)}</div> : sectionError('nearby') || <EmptyMessage>No sample businesses near {city} yet. Choose another city to explore.</EmptyMessage>}
            <p className="home-data-note">Ranked by recent synthetic activity within 25 km of {city}.</p>
          </section>

          <section className="home-section home-section-rising" aria-label="Rising businesses">
            <SectionHeading icon={<TrendingUp size={18} />} eyebrow="GROWING MOMENTUM" title="Rising Businesses" href="/test/trending" label="View all" />
            {rising.length ? <div className="home-business-list">{rising.slice(0, 4).map(item => <BusinessCard key={item.id} business={item} subtitle={`${item.interactions ?? 0} recent interactions`} featured />)}</div> : sectionError('rising') || <EmptyMessage>No rising businesses are available yet.</EmptyMessage>}
            <p className="home-data-note">Momentum reflects recent activity in this synthetic preview.</p>
          </section>
        </div>

        <aside className="home-discovery-rail" aria-label="More ways to discover">
          <section className="home-section home-section-categories" aria-label="Popular categories">
            <SectionHeading icon={<Compass size={18} />} eyebrow="FIND YOUR NEXT FAVOURITE" title="Popular Categories" />
            {popularCategories.length ? <div className="home-category-grid home-category-list">{popularCategories.slice(0, 8).map(item => <Link className="home-category-card" key={item.id} to={locationQuery(item.id)}><span className="home-category-spark"><Sparkles size={15} aria-hidden="true" /></span><strong>{item.name}</strong><span>{item.launchCount ?? 0} published {item.launchCount === 1 ? 'launch' : 'launches'}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>)}</div> : sectionError('popularCategories') || <EmptyMessage>No popular categories are available yet.</EmptyMessage>}
          </section>

          <section className="home-section home-section-guides" aria-label="Local guides">
            <SectionHeading icon={<Compass size={18} />} eyebrow="COMMUNITY-CURATED COLLECTIONS" title="Local Guides" />
            {publicCollections.filter(item => item.shareUrl).length ? <div className="home-guide-grid">{publicCollections.filter(item => item.shareUrl).slice(0, 6).map((collection, index) => {
              const guideImage = collection.launches[0]?.images?.[0]
              return <Link key={collection.id} className={`home-guide-card home-guide-${['sage', 'gold', 'rose'][index % 3]}`} to={collection.shareUrl!}>
                <span className="home-guide-photo">{guideImage ? <img src={guideImage.url} alt="" loading="lazy" /> : <Compass size={20} aria-hidden="true" />}</span>
                <span className="home-guide-copy"><span className="home-guide-label">PUBLIC COLLECTION · {collection.launchCount} {collection.launchCount === 1 ? 'LAUNCH' : 'LAUNCHES'}</span><strong>{collection.name}</strong><p>{collection.description || 'A community-curated collection of published launches.'}</p><span className="home-guide-cta">Browse collection <ArrowRight size={14} aria-hidden="true" /></span></span>
              </Link>
            })}</div> : sectionError('guides') || <EmptyMessage>No public collections are available yet. Community-shared guides will appear here.</EmptyMessage>}
          </section>
        </aside>
      </div>

      <div className="home-lower-grid">
        <section className="home-section home-section-upcoming" aria-label="Upcoming launches">
          <SectionHeading icon={<CalendarDays size={18} />} eyebrow="ON THE HORIZON" title="Upcoming Launches" href="/test/upcoming" label="View all" />
          {upcoming.length ? <div className="home-upcoming-grid">{upcoming.slice(0, 3).map(item => <Link to={`/test/launch/${encodeURIComponent(item.slug)}`} key={item.id} className="home-upcoming-card"><span className="home-upcoming-date"><CalendarDays size={18} aria-hidden="true" />{item.launchAt ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(item.launchAt)) : 'Soon'}</span><span className="home-card-kicker">{item.category}</span><strong>{item.title}</strong><span className="home-upcoming-meta">{item.brand.name} · {[item.location?.city, item.location?.state].filter(Boolean).join(', ')}</span><span className="home-card-action">Get a first look <ArrowRight size={15} aria-hidden="true" /></span></Link>)}</div> : sectionError('upcoming') || <EmptyMessage>No upcoming launches are scheduled in the sample preview.</EmptyMessage>}
        </section>

        <section className="home-section home-section-monthly" aria-label="Top businesses this month">
          <SectionHeading icon={<TrendingUp size={18} />} eyebrow="MONTHLY MOMENTUM" title="Top Businesses This Month" href="/test/trending" label="View all" />
          {monthlyBusinesses.length ? <div className="home-monthly-list">{monthlyBusinesses.slice(0, 6).map(item => <div className="home-monthly-row" key={item.business.id}><span className="home-monthly-rank">{String(item.rank).padStart(2, '0')}</span><BusinessCard business={item.business} subtitle={`${item.score} monthly points`} /></div>)}</div> : sectionError('monthly') || <EmptyMessage>Monthly business rankings will appear when qualified activity is available.</EmptyMessage>}
          <p className="home-data-note">Ranked by monthly engagement with published launches.</p>
        </section>
      </div>
    </div>
    <nav className="home-mobile-tabs" aria-label="Mobile navigation">
      <Link to="/test"><Home size={18} aria-hidden="true" /><span>Home</span></Link>
      <Link to="/test/nearby"><Compass size={18} aria-hidden="true" /><span>Explore</span></Link>
      <Link to="/test/collections"><Bookmark size={18} aria-hidden="true" /><span>Saved</span></Link>
      <Link to="/test/account"><UserRound size={18} aria-hidden="true" /><span>Profile</span></Link>
    </nav>
  </section>
}

export function SyntheticFounderPage({ slug, user }: { slug: string; user: ProfileViewer | null }) {
  const [founder, setFounder] = useState<HomeFounder | null>(null)
  const [businesses, setBusinesses] = useState<PublicBusiness[]>([])
  const [launches, setLaunches] = useState<Launch[]>([])
  const [publicCollections, setPublicCollections] = useState<PublicCollection[]>([])
  const [loadedSlug, setLoadedSlug] = useState('')
  const [error, setError] = useState('')
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { item } = await api<{ item: HomeFounder }>(`/founders/${encodeURIComponent(slug)}`)
        const [businessResult, launchResult, collectionResult] = await Promise.allSettled([
          Promise.all(item.brands.map(async brand => (await api<{ item: PublicBusiness }>(`/brands/${encodeURIComponent(brand.slug)}`)).item)),
          api<ApiPage<Launch>>(`/launches?${new URLSearchParams({ query: item.displayName, limit: '50', sort: 'new', source: 'search' })}`),
          api<ApiPage<PublicCollection>>('/collections/public?limit=50')
        ])
        if (!active) return
        const nextSectionErrors: Record<string, string> = {}
        if (businessResult.status === 'fulfilled') {
          setBusinesses(businessResult.value.filter(business => business.founders?.some(person => person.id === item.id || person.slug === item.slug)))
        } else {
          nextSectionErrors.business = businessResult.reason instanceof Error ? businessResult.reason.message : 'Current business details could not be loaded.'
          setBusinesses([])
        }
        if (launchResult.status === 'fulfilled') {
          setLaunches(launchResult.value.items.filter(launch => launch.founders?.some(person => person.id === item.id || person.slug === item.slug)))
        } else {
          nextSectionErrors.launches = launchResult.reason instanceof Error ? launchResult.reason.message : 'Selected launches could not be loaded.'
          setLaunches([])
        }
        if (collectionResult.status === 'fulfilled') {
          setPublicCollections(collectionResult.value.items.filter(collection => collection.isPublic && collection.shareUrl))
        } else {
          nextSectionErrors.collections = collectionResult.reason instanceof Error ? collectionResult.reason.message : 'Saved collections could not be loaded.'
          setPublicCollections([])
        }
        setFounder(item); setError(''); setSectionErrors(nextSectionErrors)
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : 'This synthetic founder is unavailable.')
      } finally {
        if (active) setLoadedSlug(slug)
      }
    })()
    return () => { active = false }
  }, [slug])
  const currentFounder = loadedSlug === slug ? founder : null
  const founderLaunchIds = new Set((currentFounder ? launches : []).map(launch => launch.id))
  const relatedCollections = publicCollections.map(collection => ({
    ...collection,
    launches: collection.launches.filter(launch => founderLaunchIds.has(launch.id))
  })).filter(collection => collection.launches.length > 0)
  const location = [currentFounder?.city, currentFounder?.state].filter(Boolean).join(', ')
  const roleAndLocation = [currentFounder?.role, currentFounder?.pronouns, location].filter(Boolean).join(' · ')
  return <section className="test-content-width test-feature-page home-founder-page" aria-label="Public founder profile">
    <Link className="test-back-link" to="/test">← Back to Aarambh</Link>
    {loadedSlug !== slug ? <div className="test-notice">Loading founder profile…</div> : error ? <div className="test-notice test-notice-error">{error}</div> : !currentFounder ? <div className="test-notice">Loading founder profile…</div> : <>
      <header className="home-founder-hero">
        <div className="home-founder-identity">
          <FounderPortrait key={`${currentFounder.id}:${currentFounder.avatarUrl || ''}`} founder={currentFounder} />
          <div className="home-founder-intro"><span className="test-eyebrow">PUBLIC FOUNDER PROFILE</span><h1>{currentFounder.displayName}</h1>{roleAndLocation && <p className="home-founder-location"><MapPin size={15} aria-hidden="true" />{roleAndLocation}</p>}{currentFounder.bio && <p className="home-founder-bio">{currentFounder.bio}</p>}{currentFounder.interests?.length ? <div className="home-founder-interests" aria-label="Founder interests">{currentFounder.interests.map((interest, index) => <span key={`${interest}-${index}`}>{interest}</span>)}</div> : null}</div>
        </div>
        <section className="home-founder-current" aria-labelledby="founder-current-heading">
          <h2 id="founder-current-heading">Current business</h2>
          {sectionErrors.business ? <EmptyMessage>{sectionErrors.business}</EmptyMessage> : businesses.length ? <div className="home-founder-business-list">{businesses.map(business => <article className="home-founder-business-card" key={business.id}>
            <span className="home-founder-business-mark"><FounderBusinessLogo key={`${business.id}:${business.logoUrl || ''}`} business={business} /></span>
            <div className="home-founder-business-copy"><h3>{business.name}</h3><p>{business.tagline || [business.area, business.city, business.state].filter(Boolean).join(' · ')}</p><Link className="home-founder-business-link" to={`/test/brand/${encodeURIComponent(business.slug)}`}>View business profile <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
          </article>)}</div> : <EmptyMessage>No current public businesses are connected to this profile.</EmptyMessage>}
        </section>
        <div className="home-founder-actions" aria-label="Founder actions">
          {user ? <FollowTarget targetType="founder" targetId={currentFounder.id} label="Follow" user={user} /> : <div className="home-founder-guest-follow"><Link className="home-founder-follow-link" to="/test/account">Follow</Link><Link className="home-founder-signin" to="/test/account">Sign in to follow this founder.</Link></div>}
        </div>
      </header>

      <div className="home-founder-section-grid">
        <section className="home-founder-section" aria-labelledby="founder-launches-heading">
          <div className="home-founder-section-heading"><div><span className="test-eyebrow">FROM THIS FOUNDER</span><h2 id="founder-launches-heading">Selected launches</h2></div></div>
          {sectionErrors.launches ? <EmptyMessage>{sectionErrors.launches}</EmptyMessage> : launches.length ? <div className="home-founder-launch-grid">{launches.map(launch => {
            const artwork = founderPageArtwork(launch, launches)
            return <article className="home-founder-launch-card" key={launch.id}>
            <Link className="home-founder-launch-image" to={`/test/launch/${encodeURIComponent(launch.slug)}`} aria-label={`View ${launch.title}`}>
              <FounderPageImage key={`${artwork.src}:${artwork.fallbackSrc || ''}`} artwork={artwork} empty={<span><Sparkles size={20} aria-hidden="true" /></span>} />
            </Link>
            <div className="home-founder-launch-copy"><span>{launch.category}</span><h3><Link to={`/test/launch/${encodeURIComponent(launch.slug)}`}>{launch.title}</Link></h3>{launch.summary && <p>{launch.summary}</p>}</div>
          </article>
          })}</div> : <EmptyMessage>No published launches are connected to this founder yet.</EmptyMessage>}
        </section>

        <section className="home-founder-section" aria-labelledby="founder-collections-heading">
          <div className="home-founder-section-heading"><div><span className="test-eyebrow">PUBLICLY SHARED</span><h2 id="founder-collections-heading">Saved collections</h2></div></div>
          {sectionErrors.collections ? <EmptyMessage>{sectionErrors.collections}</EmptyMessage> : relatedCollections.length ? <div className="home-founder-collection-list">{relatedCollections.map(collection => {
            const previewLaunch = collection.launches[0]
            const preview = previewLaunch ? founderPageArtwork(previewLaunch, launches) : { src: '', altText: '' }
            return <article className="home-founder-collection-card" key={collection.id}>
              <Link className="home-founder-collection-image" to={collection.shareUrl!} aria-label={`Open ${collection.name}`}><FounderPageImage key={`${preview.src}:${preview.fallbackSrc || ''}`} artwork={preview} empty={<Bookmark size={19} aria-hidden="true" />} /></Link>
              <div className="home-founder-collection-copy"><Link to={collection.shareUrl!} className="home-founder-collection-name">{collection.name}</Link><span>{collection.launches.length} related {collection.launches.length === 1 ? 'launch' : 'launches'}</span><Link className="home-founder-collection-link" to={collection.shareUrl!}>View collection <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
            </article>
          })}</div> : <EmptyMessage>No public collections include this founder’s published launches yet.</EmptyMessage>}
        </section>
      </div>
    </>}
  </section>
}
