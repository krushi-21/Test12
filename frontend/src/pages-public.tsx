import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, MapPin, Search, Sparkles } from 'lucide-react'
import { DEMO_CATEGORIES, DEMO_FOUNDERS, DEMO_LAUNCHES, DEMO_LEADERBOARD_SLUGS, DEMO_PUBLIC_BRANDS } from './demo'
import { AppShell, EmptyState, LaunchCard, PageHeading } from './ui'
import type { LaunchImage } from './types'

function ExploreFilters({ selected, onChange }: { selected: string; onChange: (value: string) => void }) {
  return <div className="category-scroll" role="group" aria-label="Filter synthetic launches by category">
    <button type="button" className={`category-chip ${selected === '' ? 'selected' : ''}`} aria-pressed={selected === ''} onClick={() => onChange('')}>All launches</button>
    {DEMO_CATEGORIES.map((category) => <button type="button" key={category.id} className={`category-chip ${selected === category.id ? 'selected' : ''}`} aria-pressed={selected === category.id} onClick={() => onChange(selected === category.id ? '' : category.id)}>{category.name}</button>)}
  </div>
}

function matchesSelectedCategory(launch: (typeof DEMO_LAUNCHES)[number], category: string, categoryName?: string) {
  return !category || launch.category === categoryName
}

export function ExplorePage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const normalized = query.trim().toLocaleLowerCase()
  const selectedCategoryName = DEMO_CATEGORIES.find((item) => item.id === category)?.name
  const visibleLaunches = useMemo(() => DEMO_LAUNCHES.filter((launch) => {
    const searchText = [launch.title, launch.summary, launch.category, launch.brand.name, ...launch.founders.map((founder) => founder.displayName)].join(' ').toLocaleLowerCase()
    return matchesSelectedCategory(launch, category, selectedCategoryName) && (!normalized || searchText.includes(normalized))
  }), [category, normalized, selectedCategoryName])
  const matchingBrands = normalized ? DEMO_PUBLIC_BRANDS.filter((brand) => brand.name.toLocaleLowerCase().includes(normalized) && (!category || brand.category === selectedCategoryName)) : []
  const matchingFounders = normalized ? DEMO_FOUNDERS.filter((founder) => founder.displayName.toLocaleLowerCase().includes(normalized) && DEMO_LAUNCHES.some((launch) => matchesSelectedCategory(launch, category, selectedCategoryName) && launch.founders.some((item) => item.id === founder.id))) : []
  const hasActiveFilters = Boolean(normalized || category)
  const clearFilters = () => { setQuery(''); setCategory('') }

  return <AppShell><div className="content-width explore-page">
    <section className="explore-intro" aria-labelledby="explore-title">
      <h1 id="explore-title" className="explore-value">See what’s just launched.</h1>
      <p>New ideas and independent makers from across India.</p>
    </section>
    <div className="explore-search" role="search">
      <Search size={18} aria-hidden="true" />
      <label className="visually-hidden" htmlFor="launch-search">Search synthetic launches, brands, or founders</label>
      <input id="launch-search" type="search" placeholder="Search launches, brands, founders, or categories" value={query} onChange={(event) => setQuery(event.target.value)} />
      {query && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>Clear</button>}
    </div>
    <div className="filter-controls">
      <ExploreFilters selected={category} onChange={setCategory} />
      {hasActiveFilters && <button type="button" className="clear-filters" onClick={clearFilters}>Clear filters</button>}
    </div>
    {(matchingBrands.length > 0 || matchingFounders.length > 0) && <section className="matching-profiles" aria-labelledby="matching-profiles-title">
      <h2 id="matching-profiles-title">Matching synthetic profiles</h2>
      <div className="matching-profile-links">
        {matchingBrands.map((brand) => <Link className="matching-profile-link" key={brand.id} to={`/brand/${brand.slug}`}><span className="profile-result-kind">Brand</span><strong>{brand.name}</strong><span>{brand.category}</span><ArrowRight size={15} aria-hidden="true" /></Link>)}
        {matchingFounders.map((founder) => <Link className="matching-profile-link" key={founder.id} to={`/founder/${founder.id}`}><span className="profile-result-kind">Founder</span><strong>{founder.displayName}</strong><span>{founder.role || 'Synthetic founder'}</span><ArrowRight size={15} aria-hidden="true" /></Link>)}
      </div>
    </section>}
    <section className="feed-section" aria-labelledby="feed-title">
      <div className="feed-heading"><div><span className="eyebrow">SYNTHETIC SAMPLE RECORDS</span><h2 id="feed-title">Explore launches</h2></div><span className="muted-label" role="status" aria-live="polite">{visibleLaunches.length} demo {visibleLaunches.length === 1 ? 'launch' : 'launches'}{normalized ? ` · ${matchingBrands.length + matchingFounders.length} matching ${matchingBrands.length + matchingFounders.length === 1 ? 'profile' : 'profiles'}` : ''}</span></div>
      {visibleLaunches.length > 0
        ? <div className="launch-feed">{visibleLaunches.map((launch) => <LaunchCard launch={launch} key={launch.id} />)}</div>
        : <EmptyState icon={Search} title="No matching demo launches" description="No synthetic launch matches those filters. Try another launch, brand, founder, or approved category." action={<button type="button" className="button button-secondary" onClick={clearFilters}>Clear all filters</button>} />}
    </section>
    <div className="coming-soon-note"><Sparkles size={16} /><span>Founder tools coming soon. This preview is read-only.</span></div>
  </div></AppShell>
}

export function HowItWorksPage() {
  return <AppShell><div className="content-width standard-page how-it-works-page">
    <Link to="/" className="back-link"><ArrowLeft size={16} aria-hidden="true" />Back to Explore</Link>
    <PageHeading eyebrow="ABOUT THE LOCAL PREVIEW" title="How Aarambh works" description="A quick guide to browsing this fixture-only discovery preview." />
    <aside className="how-it-works-note" aria-label="Preview status">
      <span className="tag tag-neutral">Synthetic · read-only</span>
      <p>This preview is for exploring sample launches. Its fictional records and images are bundled locally; no real user data is used.</p>
    </aside>

    <section className="how-section" aria-labelledby="how-discovery-heading">
      <h2 id="how-discovery-heading">From browse to detail</h2>
      <div className="how-steps">
        <article className="how-step"><span className="how-step-number" aria-hidden="true">01</span><div><h3>Explore sample launches</h3><p>Search or filter by category. Results come from the fictional records bundled with this preview.</p></div></article>
        <article className="how-step"><span className="how-step-number" aria-hidden="true">02</span><div><h3>Open a local detail page</h3><p>Follow internal links to a launch and its related synthetic brand or founder profile.</p></div></article>
        <article className="how-step"><span className="how-step-number" aria-hidden="true">03</span><div><h3>Read sample positions carefully</h3><p>The leaderboard shows fixed local fixture views. It is not live, and ranking weights are undecided.</p></div></article>
      </div>
    </section>

    <section className="how-section how-boundaries" aria-labelledby="how-boundaries-heading">
      <h2 id="how-boundaries-heading">What this preview does—and doesn’t do</h2>
      <ul>
        <li>It reads bundled fictional fixtures; the frontend does not call an API.</li>
        <li>It is read-only: there are no sign-in or personal-data forms, writes, engagement controls, reports, or click tracking.</li>
        <li>All browse links stay inside this local preview; no external business destinations are provided.</li>
      </ul>
    </section>

    <section className="how-preview-card" aria-labelledby="how-preview-heading">
      <h2 id="how-preview-heading">Browse the preview</h2>
      <p>Continue exploring the sample records using internal page links.</p>
      <div className="how-preview-links">
        <Link to="/" className="button button-primary how-browse-link">Explore sample launches <ArrowRight size={15} aria-hidden="true" /></Link>
        <Link to="/leaderboard" className="button button-secondary how-browse-link">View sample leaderboard <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
    </section>
  </div></AppShell>
}

type LeaderboardPeriod = keyof typeof DEMO_LEADERBOARD_SLUGS

export function LeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly')
  const [category, setCategory] = useState('')
  const categoryName = DEMO_CATEGORIES.find((item) => item.id === category)?.name
  const visibleLaunches = DEMO_LEADERBOARD_SLUGS[period].flatMap((slug) => {
    const launch = DEMO_LAUNCHES.find((item) => item.slug === slug)
    if (!launch || (categoryName && launch.category !== categoryName)) return []
    return [launch]
  })

  return <AppShell><div className="content-width standard-page leaderboard-page">
    <Link to="/" className="back-link leaderboard-back-link"><ArrowLeft size={16} />Back to Explore</Link>
    <PageHeading eyebrow="LOCAL FIXTURE VIEW" title="Sample leaderboard" description="A fixed order of local synthetic launches—not live or engagement-based." action={<span className="tag tag-neutral">Sample positions</span>} />
    <aside className="leaderboard-weight-note"><strong>Illustrative only; ranking weights are still undecided.</strong></aside>
    <p className="leaderboard-boundary-note">Positions do not indicate sales, quality, popularity, or any real-world ranking.</p>
    <div className="leaderboard-filters">
      <div className="leaderboard-filter-group">
        <span className="leaderboard-filter-label">Sample period</span>
        <div className="leaderboard-period-switch" role="group" aria-label="Sample period">
          {(['weekly', 'monthly'] as const).map((value) => <button type="button" key={value} className={`leaderboard-period-button${period === value ? ' selected' : ''}`} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === 'weekly' ? 'Weekly' : 'Monthly'}</button>)}
        </div>
      </div>
      <div className="leaderboard-filter-group">
        <label className="leaderboard-filter-label" htmlFor="leaderboard-category">Category</label>
        <select id="leaderboard-category" className="leaderboard-category-select" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {DEMO_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
    </div>
    <p className="leaderboard-view-note">Weekly and Monthly show local fixture views only.</p>
    {visibleLaunches.length > 0
      ? <ol className="leaderboard-list" aria-label={`${period} sample launch positions`}>
        {visibleLaunches.map((launch, index) => <li className="leaderboard-row" key={launch.id} data-fixture-slug={launch.slug}>
          <span className="leaderboard-position" aria-label={`Illustrative position ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
          <Link className="leaderboard-row-link" to={`/launch/${launch.slug}`} aria-label={`Open synthetic launch details: ${launch.title}`}>
            <span className="leaderboard-row-copy"><span className="tag tag-category">{launch.category}</span><h2>{launch.title}</h2><span className="leaderboard-row-meta"><span className="leaderboard-brand">{launch.brand.name}</span><span>Founder{launch.founders.length === 1 ? '' : 's'}: {launch.founders.map((founder) => founder.displayName).join(', ')}</span></span></span>
            <span className="leaderboard-open-link">View launch <ArrowRight size={15} aria-hidden="true" /></span>
          </Link>
        </li>)}
      </ol>
      : <section className="leaderboard-empty" aria-live="polite"><h2>No sample launches in this view</h2><p>There are no local launch fixtures for this period and category combination.</p></section>}
  </div></AppShell>
}

function LaunchImageCarousel({ images, launchTitle }: { images: LaunchImage[]; launchTitle: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  if (images.length === 0) return <div className="launch-gallery-empty">No sample images are available for this launch.</div>

  const imageCount = images.length
  const activeImage = images[activeIndex] ?? images[0]
  const moveTo = (index: number) => setActiveIndex(Math.max(0, Math.min(index, imageCount - 1)))

  return <section
    className="launch-gallery"
    role="region"
    aria-roledescription="carousel"
    aria-label={`${launchTitle} images`}
    tabIndex={imageCount > 1 ? 0 : undefined}
    onKeyDown={(event) => {
      if (imageCount < 2) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveTo(activeIndex - 1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); moveTo(activeIndex + 1) }
    }}
  >
    <div className="launch-gallery-stage" role="group" aria-roledescription="slide" aria-label={`Image ${activeIndex + 1} of ${imageCount}`}>
      <img src={activeImage.url} alt={activeImage.altText || `Synthetic sample image ${activeIndex + 1} for ${launchTitle}`} />
    </div>
    <div className="launch-gallery-controls">
      <button type="button" className="gallery-arrow gallery-previous" aria-label="Previous image" onClick={() => moveTo(activeIndex - 1)} disabled={activeIndex === 0}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <div className="gallery-position-controls" role="group" aria-label="Choose an image">
        {images.map((image, index) => <button
          type="button"
          className={`gallery-position-button${activeIndex === index ? ' is-active' : ''}`}
          aria-label={`Show image ${index + 1} of ${imageCount}`}
          aria-current={activeIndex === index ? 'true' : undefined}
          key={`${image.url}-${index}`}
          onClick={() => moveTo(index)}
        ><span className="gallery-position-dot" aria-hidden="true" /></button>)}
      </div>
      <span className="gallery-count" aria-live="polite">{activeIndex + 1} / {imageCount}</span>
      <button type="button" className="gallery-arrow gallery-next" aria-label="Next image" onClick={() => moveTo(activeIndex + 1)} disabled={activeIndex === imageCount - 1}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  </section>
}

export function LaunchDetailPage() {
  const { slug = '' } = useParams()
  const launch = DEMO_LAUNCHES.find((item) => item.slug === slug)
  if (!launch) return <NotFoundContent title="Launch unavailable" description="This launch is not in the current local synthetic sample collection." />

  return <AppShell><div className="content-width standard-page">
    <Link to="/" className="back-link"><ArrowLeft size={16} />Back to Explore</Link>
    <article className="detail-page" aria-labelledby="launch-title">
      <div className="launch-detail-visual"><LaunchImageCarousel images={launch.images} launchTitle={launch.title} /></div>
      <div className="detail-copy">
        <div className="detail-kicker-row">
          <span className="tag tag-category">{launch.category}</span>
          <span className="tag tag-neutral">{launch.launchType}</span>
          <span className="sample-label">Synthetic sample</span>
        </div>
        <h1 id="launch-title">{launch.title}</h1>
        <p className="detail-summary">{launch.summary}</p>
        {launch.location && (launch.location.city || launch.location.state) && <p className="detail-location"><MapPin size={15} aria-hidden="true" />{[launch.location.city, launch.location.state].filter(Boolean).join(', ')}</p>}
        <div className="detail-profile-links"><Link to={`/brand/${launch.brand.slug}`} className="profile-link"><img src={launch.brand.logoUrl} alt="" /><span><small>SYNTHETIC BRAND</small><strong>{launch.brand.name}</strong></span></Link>
          {launch.founders.map((founder) => <Link to={`/founder/${founder.id}`} className="profile-link" key={founder.id}><span className="avatar-initial">{founder.displayName.charAt(0)}</span><span><small>SYNTHETIC FOUNDER</small><strong>{founder.displayName}</strong></span></Link>)}
        </div>
        {launch.story && <section className="story-section" aria-labelledby="launch-story-heading"><h2 id="launch-story-heading">Launch story</h2><p>{launch.story}</p></section>}
        <p className="read-only-note"><strong>Read-only demo.</strong> This page uses local synthetic launch, brand, and founder fixtures.</p>
      </div>
    </article>
  </div></AppShell>
}

export function BrandPage() {
  const { slug = '' } = useParams()
  const brand = DEMO_PUBLIC_BRANDS.find((item) => item.slug === slug)
  if (!brand) return <NotFoundContent />

  return <AppShell><div className="content-width standard-page">
    <Link to="/" className="back-link"><ArrowLeft size={16} />Back to Explore</Link>
    <section className="profile-hero" aria-labelledby="brand-profile-title"><img className="profile-logo" src={brand.logoUrl} alt="" /><div><span className="tag tag-neutral">Synthetic demo brand</span><h1 id="brand-profile-title">{brand.name}</h1><span className="tag tag-category">{brand.category}</span>{brand.tagline && <p className="profile-tagline">{brand.tagline}</p>}<p className="profile-location">{[brand.city, brand.state].filter(Boolean).join(', ')}</p></div></section>
    <section className="profile-story" aria-labelledby="brand-story-heading"><h2 id="brand-story-heading">Brand story</h2><p>{brand.description}</p></section>
    <section className="profile-section"><div className="feed-heading"><div><span className="eyebrow">SYNTHETIC SAMPLE RECORDS</span><h2>Launches from {brand.name}</h2></div></div><div className="launch-feed">{brand.launches.map((launch) => <LaunchCard launch={launch} key={launch.id} />)}</div></section>
    <section className="profile-section" aria-labelledby="brand-founders-heading"><h2 id="brand-founders-heading">Founders</h2><div className="profile-link-list">{brand.founders.map((founder) => <Link to={`/founder/${founder.id}`} className="profile-link" key={founder.id}><span className="avatar-initial">{founder.displayName.charAt(0)}</span><span><small>SYNTHETIC FOUNDER</small><strong>{founder.displayName}</strong></span><ArrowRight size={16} /></Link>)}</div></section>
  </div></AppShell>
}

export function FounderPage() {
  const { id = '' } = useParams()
  const founder = DEMO_FOUNDERS.find((item) => item.id === id)
  if (!founder) return <NotFoundContent />

  const brands = DEMO_PUBLIC_BRANDS.filter((brand) => brand.founders.some((item) => item.id === founder.id))
  return <AppShell><div className="content-width standard-page">
    <Link to="/" className="back-link"><ArrowLeft size={16} />Back to Explore</Link>
    <section className="profile-hero founder-hero" aria-labelledby="founder-profile-title"><span className="avatar-initial profile-avatar">{founder.displayName.charAt(0)}</span><div><span className="tag tag-neutral">Synthetic demo founder</span><h1 id="founder-profile-title">{founder.displayName}</h1><p className="founder-role">{founder.role}</p><p>{founder.bio}</p><p className="profile-location">{[founder.city, founder.state].filter(Boolean).join(', ')}</p></div></section>
    <section className="profile-section"><h2>Related synthetic brands</h2><div className="profile-link-list">{brands.map((brand) => <Link to={`/brand/${brand.slug}`} className="profile-link" key={brand.id}><img src={brand.logoUrl} alt="" /><span><small>SYNTHETIC BRAND</small><strong>{brand.name}</strong></span><ArrowRight size={16} /></Link>)}</div></section>
    <p className="read-only-note"><strong>Read-only demo.</strong> This sample profile is fictional and does not represent a verified person or business.</p>
  </div></AppShell>
}

function NotFoundContent({ title = 'Sample page not found', description = 'This synthetic record is not in the local demo collection.' }: { title?: string; description?: string }) {
  return <AppShell><div className="content-width standard-page"><EmptyState title={title} description={description} action={<Link to="/" className="button button-primary">Explore launches</Link>} /></div></AppShell>
}
