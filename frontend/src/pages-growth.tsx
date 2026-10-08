import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Flame, MapPin, Sparkles, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeading } from './ui'
import './growth.css'

type ApiErrorShape = { error?: { message?: string } }
class ApiRequestError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.name = 'ApiRequestError'; this.status = status }
}
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' })
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({})) as T & ApiErrorShape
  if (!response.ok) throw new ApiRequestError(payload.error?.message || `Request failed (${response.status}).`, response.status)
  return payload
}
const requestError = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.'
const isAuthError = (error: unknown) => error instanceof ApiRequestError && (error.status === 401 || error.status === 403)
const reminderErrorMessage = (error: unknown) => error instanceof ApiRequestError && error.status === 403
  ? 'You can’t set a reminder for a launch you own.'
  : error instanceof ApiRequestError && error.status === 401
    ? 'Sign in to set or remove launch reminders.'
    : requestError(error)
const jsonBody = (value: unknown) => JSON.stringify(value)

 type Launch = {
  id: string
  slug: string
  title: string
  summary?: string
  story?: string
  category: string
  launchType?: string
  brand?: { id?: string; slug?: string; name?: string }
  location?: { city?: string; area?: string; state?: string }
  launchAt?: string
  launchDate?: string
  lifecycleStage?: string
  countdownSeconds?: number
  images?: Array<{ url: string; altText: string }>
}
type LifecycleState = { lifecycleStage?: string; launchAt?: string; notified: boolean; countdownSeconds?: number }
type Brand = { id: string; name: string }
type AnalyticsKey = 'impressions' | 'detailViews' | 'likes' | 'saves' | 'shares' | 'clickOuts'
type AnalyticsDay = { date: string } & Record<AnalyticsKey, number>
type AnalyticsResponse = { range: '7d' | '30d'; totals: Record<AnalyticsKey, number>; series: AnalyticsDay[] }
type RankedLaunch = { rank: number; score: number; id: string; slug: string; title: string; brandName: string; city?: string; category?: string }
type RisingBusiness = { id: string; slug: string; name: string; city?: string; category?: string; interactions: number }
type TrendingResponse = { today: RankedLaunch[]; week: RankedLaunch[]; month: RankedLaunch[]; risingBusinesses: RisingBusiness[]; generatedAt?: string; note?: string }
type Notification = { id: string; kind: string; subject: string; message: string; createdAt: string; readAt?: string | null }
type NotificationsResponse = { items: Notification[]; unreadCount: number; nextCursor?: string | null }

const dateKey = (value?: string) => {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
const monthLabel = (value: Date) => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(value)
const shortDate = (value?: string) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(/^\d{4}-\d{2}-\d{2}$/u.test(value) ? `${value}T12:00:00+05:30` : value)) : 'Date to be confirmed'
const stageLabel = (value?: string) => value?.replaceAll('_', ' ') || 'Upcoming'
const formatNumber = (value?: number) => new Intl.NumberFormat('en-IN').format(Number.isFinite(value) ? Number(value) : 0)
async function fetchUpcomingLaunches() {
  const items: Launch[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const params = new URLSearchParams({ limit: '50' })
    if (cursor) params.set('cursor', cursor)
    const page = await api<{ items: Launch[]; nextCursor?: string | null }>(`/launches/upcoming?${params.toString()}`)
    items.push(...page.items)
    cursor = page.nextCursor || undefined
    pages += 1
  } while (cursor && pages < 100)
  return items
}
const analyticsMetrics: Array<{ key: AnalyticsKey; label: string; note: string }> = [
  { key: 'impressions', label: 'Feed impressions', note: 'How often launches appeared in the feed' },
  { key: 'detailViews', label: 'Launch views', note: 'Visits to your launch details' },
  { key: 'likes', label: 'Likes', note: 'Qualified community likes' },
  { key: 'saves', label: 'Saves', note: 'Qualified community saves' },
  { key: 'shares', label: 'Shares', note: 'Launches shared by members' },
  { key: 'clickOuts', label: 'External clicks', note: 'Qualified clicks to external destinations' },
]
const sparklinePoints = (values: number[]) => {
  if (!values.length) return ''
  const max = Math.max(1, ...values)
  return values.map((value, index) => `${values.length === 1 ? 50 : index * (100 / (values.length - 1))},${31 - (Math.max(0, value) / max) * 25}`).join(' ')
}

export function LaunchLifecyclePage() {
  const [today] = useState(() => new Date())
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedDay, setSelectedDay] = useState(today.getDate())
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [launches, setLaunches] = useState<Launch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [lifecycle, setLifecycle] = useState<Record<string, LifecycleState>>({})
  const [lifecycleErrors, setLifecycleErrors] = useState<Record<string, string>>({})
  const [busySlug, setBusySlug] = useState('')
  const [reminderError, setReminderError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    void fetchUpcomingLaunches()
      .then(result => { if (active) { setLaunches(result); setLoadError('') } })
      .catch(error => { if (active) setLoadError(requestError(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reloadKey])

  const cityOptions = useMemo(() => [...new Set(launches.map(item => item.location?.city).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b)), [launches])
  const categoryOptions = useMemo(() => [...new Set(launches.map(item => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [launches])
  const filteredLaunches = useMemo(() => launches.filter(item => (!city || item.location?.city === city) && (!category || item.category === category)), [launches, city, category])
  const startOffset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const calendarCells = useMemo(() => {
    const days: Array<number | null> = [...Array.from({ length: startOffset }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
    return [...days, ...Array.from({ length: (7 - days.length % 7) % 7 }, () => null)]
  }, [daysInMonth, startOffset])
  const selectedDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
  const selectedEvents = useMemo(() => filteredLaunches.filter(item => dateKey(item.launchAt || item.launchDate) === selectedDate), [filteredLaunches, selectedDate])
  const currentMonthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  const monthLabelText = monthLabel(month)

  useEffect(() => {
    let active = true
    if (!selectedEvents.length) return () => { active = false }
    void Promise.all(selectedEvents.map(async launch => {
      try {
        const result = await api<LifecycleState>(`/launches/${encodeURIComponent(launch.slug)}/lifecycle`)
        if (active) {
          setLifecycle(current => ({ ...current, [launch.slug]: result }))
          setLifecycleErrors(current => ({ ...current, [launch.slug]: '' }))
        }
      } catch (error) {
        if (active) setLifecycleErrors(current => ({ ...current, [launch.slug]: requestError(error) }))
      }
    }))
    return () => { active = false }
  }, [selectedEvents])

  const changeMonth = (delta: number) => {
    setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1))
    setSelectedDay(1)
    setReminderError('')
  }
  const toggleReminder = async (launch: Launch) => {
    const current = lifecycle[launch.slug]
    if (!current) return
    setBusySlug(launch.slug)
    setReminderError('')
    try {
      const next = await api<{ notified: boolean }>(`/launches/${encodeURIComponent(launch.slug)}/notify`, {
        method: current.notified ? 'DELETE' : 'PUT',
        ...(current.notified ? {} : { body: jsonBody({}) }),
      })
      setLifecycle(value => ({ ...value, [launch.slug]: { ...current, notified: next.notified } }))
    } catch (error) {
      setReminderError(reminderErrorMessage(error))
    } finally { setBusySlug('') }
  }

  return <section className="growth-page-wrap growth-calendar-page">
    <PageHeading eyebrow="DISCOVER WHAT’S NEXT" title="Launch calendar" description="A live view of scheduled launches from the community." action={<span className="growth-page-kicker">UPCOMING</span>} />
    <div className="growth-calendar-layout">
      <div className="growth-calendar-main">
        <div className="growth-calendar-controls">
          <label className="growth-filter-pill"><MapPin size={14} aria-hidden="true" /><span className="visually-hidden">Filter by city</span><select aria-label="Filter by city" value={city} onChange={event => setCity(event.target.value)}><option value="">All cities</option>{cityOptions.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="growth-filter-pill"><Sparkles size={14} aria-hidden="true" /><span className="visually-hidden">Filter by category</span><select aria-label="Filter by category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categoryOptions.map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        <div className="growth-calendar-monthbar"><button type="button" className="growth-month-arrow" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button><h2>{monthLabelText}</h2><button type="button" className="growth-month-arrow" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button></div>
        <div className="growth-calendar-grid" role="grid" aria-label={`${monthLabelText} launch calendar`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(weekday => <div className="growth-calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>)}
          {calendarCells.map((day, index) => {
            if (day === null) return <div className="growth-calendar-cell is-blank" role="gridcell" key={`blank-${index}`} />
            const key = `${currentMonthKey}-${String(day).padStart(2, '0')}`
            const events = filteredLaunches.filter(item => dateKey(item.launchAt || item.launchDate) === key)
            return <button type="button" role="gridcell" aria-label={`${monthLabelText} ${day}${events.length ? `, ${events.length} upcoming ${events.length === 1 ? 'launch' : 'launches'}` : ''}`} aria-selected={selectedDay === day} className={`growth-calendar-cell${selectedDay === day ? ' is-selected' : ''}${events.length ? ' has-event' : ''}`} key={day} onClick={() => setSelectedDay(day)}><span>{day}</span>{events.length > 0 && <i aria-hidden="true" />}</button>
          })}
        </div>
        <p className="growth-local-note"><Bell size={14} aria-hidden="true" /> Reminders are sent through your Aarambh notification centre.</p>
      </div>
      <aside className="growth-agenda" aria-label="Selected date agenda">
        <div className="growth-agenda-heading"><span>SELECTED DATE</span><h2>{shortDate(selectedDate)}</h2></div>
        {loading && <div className="growth-agenda-empty" role="status"><strong>Loading scheduled launches</strong><p>Checking the live calendar.</p></div>}
        {loadError && <div className="growth-api-message is-error" role="alert"><span>{loadError}</span><button type="button" className="growth-retry-button" onClick={() => setReloadKey(current => current + 1)}>Try again</button></div>}
        {!loading && !loadError && selectedEvents.length ? selectedEvents.map(launch => {
          const status = lifecycle[launch.slug]
          return <article className={`growth-agenda-card${launch.images?.[0]?.url ? ' has-image' : ''}`} key={launch.slug}>
            {launch.images?.[0]?.url && <img className="growth-agenda-image" src={launch.images[0].url} alt={launch.images[0].altText || launch.title} loading="lazy" decoding="async" />}
            <div className="growth-agenda-copy">
            <span className="growth-agenda-date">{launch.brand?.name || 'Community launch'}</span>
            <span className="growth-agenda-meta">{[launch.location?.city, launch.category].filter(Boolean).join(' · ') || launch.category}</span>
            <Link to={`/test/launch/${encodeURIComponent(launch.slug)}`} className="growth-agenda-link">{launch.title} <ArrowRight size={14} aria-hidden="true" /></Link>
            <span className="growth-agenda-stage">{stageLabel(status?.lifecycleStage || launch.lifecycleStage)}</span>
            {status ? <button type="button" className={`growth-reminder-button${status.notified ? ' is-set' : ''}`} aria-pressed={status.notified} disabled={busySlug === launch.slug} onClick={() => void toggleReminder(launch)}>{busySlug === launch.slug ? 'Saving…' : status.notified ? <><Check size={14} aria-hidden="true" /> Reminder set · remove</> : <><Bell size={14} aria-hidden="true" /> Remind me</>}</button> : <span className="growth-reminder-pending">{lifecycleErrors[launch.slug] ? 'Reminder state unavailable' : 'Checking reminder…'}</span>}
            {lifecycleErrors[launch.slug] && <small className="growth-inline-error" role="status">{lifecycleErrors[launch.slug]}</small>}
            </div>
          </article>
        }) : null}
        {!loading && !loadError && !selectedEvents.length && <div className="growth-agenda-empty"><strong>No scheduled launches on this date</strong><p>Choose a marked day or adjust the filters.</p></div>}
        {reminderError && <p className="growth-inline-error" role="alert">{reminderError}</p>}
      </aside>
    </div>
  </section>
}

export function GrowthAnalyticsPage() {
  const [range, setRange] = useState<'7d' | '30d'>('30d')
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedBrand, setSelectedBrand] = useState('')
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null)
  const [loadedQuery, setLoadedQuery] = useState('')
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const queryKey = `${range}:${selectedBrand}`
  const analyticsLoading = loadedQuery !== queryKey

  useEffect(() => {
    let active = true
    void api<{ items: Brand[] }>('/me/brands').then(result => { if (active) setBrands(result.items) }).catch(() => { if (active) setBrands([]) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ range })
    if (selectedBrand) params.set('brandId', selectedBrand)
    void api<AnalyticsResponse>(`/me/analytics?${params.toString()}`)
      .then(result => { if (active) { setAnalytics(result); setError(''); setAuthRequired(false) } })
      .catch(err => { if (active) { setAnalytics(null); setError(requestError(err)); setAuthRequired(isAuthError(err)) } })
      .finally(() => { if (active) setLoadedQuery(queryKey) })
    return () => { active = false }
  }, [range, selectedBrand, queryKey, retryKey])

  const selectedBrandName = brands.find(item => item.id === selectedBrand)?.name
  const periodLabel = range === '7d' ? 'Last 7 days' : 'Last 30 days'
  const noAnalyticsActivity = Boolean(analytics && analyticsMetrics.every(metric => Number(analytics.totals?.[metric.key] ?? 0) === 0))
  return <section className="growth-page-wrap growth-analytics-page">
    <div className="growth-analytics-dashboard">
      <section className="growth-maker-panel" aria-labelledby="growth-analytics-title">
        <header className="growth-maker-intro"><div className="growth-analytics-topline"><span>FOUNDER WORKSPACE</span><span className="growth-live-tag"><i aria-hidden="true" /> PRIVATE ANALYTICS</span></div><h1 id="growth-analytics-title">Build on what<br />resonates.</h1><p>Follow the activity around your launches and understand how your community is finding them.</p><div className="growth-maker-context"><span>VIEWING</span><strong>{selectedBrandName || 'All your businesses'}</strong><small>{periodLabel} · Asia/Kolkata</small></div></header>
        <div className="growth-analytics-art" aria-hidden="true"><span className="growth-art-orbit orbit-one" /><span className="growth-art-orbit orbit-two" /><span className="growth-art-seed" /><span className="growth-art-caption">MADE WITH INTENTION<br />GROWN WITH COMMUNITY</span></div>
      </section>
      <section className="growth-analytics-data" aria-label="Private founder analytics">
        <div className="growth-analytics-controls">
          <label htmlFor="growth-business-select"><span>Business</span><select id="growth-business-select" aria-label="Business" value={selectedBrand} onChange={event => setSelectedBrand(event.target.value)}><option value="">All businesses</option>{brands.map(brand => <option value={brand.id} key={brand.id}>{brand.name}</option>)}</select></label>
          <label htmlFor="growth-range-select"><span>Time range</span><select id="growth-range-select" aria-label="Time range" value={range} onChange={event => setRange(event.target.value as '7d' | '30d')}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
          <div className="growth-analytics-scope"><span>Data scope</span><strong>Aggregated</strong></div>
        </div>
        {analyticsLoading && <div className="growth-analytics-loading" role="status">Loading your private analytics…</div>}
        {!analyticsLoading && error && <div className="growth-api-message is-error" role="alert"><span>{error}</span>{authRequired && <Link to="/test/account">Sign in to view founder analytics.</Link>}<button type="button" className="growth-retry-button" onClick={() => { setLoadedQuery(''); setRetryKey(current => current + 1) }}>Try again</button></div>}
        {analytics && !analyticsLoading && !error && <div className="growth-metric-grid">{analyticsMetrics.map(metric => {
          const values = analytics.series.map(day => Number(day[metric.key]) || 0)
          return <article className="growth-metric-card" key={metric.key}>
            <div className="growth-metric-heading"><span>{metric.label}</span><small>{range === '7d' ? '7 days' : '30 days'}</small></div>
            <strong>{formatNumber(analytics.totals?.[metric.key])}</strong>
            <span className="growth-metric-note">{metric.note}</span>
            <svg className="growth-metric-sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label={`${metric.label} by day for ${periodLabel.toLowerCase()}`}><polyline points={sparklinePoints(values)} /><circle cx="100" cy={values.length ? 31 - (values[values.length - 1] / Math.max(1, ...values)) * 25 : 31} r="1.8" /></svg>
          </article>
        })}</div>}
        {analytics && !analyticsLoading && !error && noAnalyticsActivity && <div className="growth-analytics-empty" role="status"><div><strong>No activity to chart yet</strong><p>Your private totals will update as people discover and engage with your launches.</p></div><Link to="/test/dashboard">Open your founder workspace <ArrowRight size={14} aria-hidden="true" /></Link></div>}
        {analytics && !analyticsLoading && !error && <p className="growth-analytics-disclaimer"><Check size={14} aria-hidden="true" /> Private totals only. No visitor identities are shown.</p>}
      </section>
    </div>
  </section>
}

export function GrowthTrendingPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'risingBusinesses'>('today')
  const [data, setData] = useState<TrendingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void api<TrendingResponse>('/trending/dashboard')
      .then(result => { if (active) { setData(result); setError('') } })
      .catch(err => { if (active) setError(requestError(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retryKey])

  const tabs: Array<{ value: typeof period; label: string }> = [
    { value: 'today', label: 'Trending today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'risingBusinesses', label: 'Rising businesses' },
  ]
  const launches = period === 'today' ? data?.today : period === 'week' ? data?.week : period === 'month' ? data?.month : undefined
  const risingBusinesses = data?.risingBusinesses || []
  return <section className="growth-page-wrap growth-trending-page">
    <div className="growth-trending-layout"><main className="growth-trending-main">
      <PageHeading eyebrow="COMMUNITY DISCOVERY" title="What India is noticing" description="Explore the launches and local businesses drawing recent community activity." />
      <div className="growth-tabs" role="tablist" aria-label="Trending activity range">{tabs.map(tab => <button type="button" role="tab" aria-selected={period === tab.value} className={period === tab.value ? 'is-active' : ''} key={tab.value} onClick={() => setPeriod(tab.value)}>{tab.label}</button>)}</div>
      {loading && <div className="growth-api-message" role="status">Loading community activity…</div>}
      {error && <div className="growth-api-message is-error" role="alert"><span>{error}</span><button type="button" className="growth-retry-button" onClick={() => setRetryKey(current => current + 1)}>Try again</button></div>}
      {!loading && !error && period !== 'risingBusinesses' && <>
        {launches?.length ? <ol className="growth-trending-list">{launches.map((launch, index) => <li key={launch.id} className={index === 0 ? 'is-featured' : ''}>
          <span className="growth-trend-rank">{String(launch.rank || index + 1).padStart(2, '0')}</span><span className="growth-trend-accent" aria-hidden="true" /><div className="growth-trend-copy"><Link to={`/test/launch/${encodeURIComponent(launch.slug)}?source=trending`} className="growth-trend-title">{launch.title}</Link><span>{launch.brandName} · {[launch.city, launch.category].filter(Boolean).join(' · ') || 'India'} · {launch.score} activity points</span></div><Link to={`/test/launch/${encodeURIComponent(launch.slug)}?source=trending`} className="growth-trend-open" aria-label={`Open ${launch.title}`}><ArrowRight size={17} aria-hidden="true" /></Link>
        </li>)}</ol> : <div className="growth-api-message">No ranked launches in this period yet. Activity will appear as the community engages with launches.</div>}
      </>}
      {!loading && !error && period === 'risingBusinesses' && <>
        {risingBusinesses.length ? <ol className="growth-trending-list growth-rising-list">{risingBusinesses.map((business, index) => <li key={business.id} className={index === 0 ? 'is-featured' : ''}>
          <span className="growth-trend-rank">{String(index + 1).padStart(2, '0')}</span><span className="growth-trend-accent" aria-hidden="true" /><div className="growth-trend-copy"><Link to={`/test/brand/${encodeURIComponent(business.slug)}?source=trending`} className="growth-trend-title">{business.name}</Link><span>{[business.city, business.category].filter(Boolean).join(' · ') || 'India'} · {formatNumber(business.interactions)} recent interactions</span></div><TrendingUp size={17} className="growth-trend-arrow" aria-hidden="true" />
        </li>)}</ol> : <div className="growth-api-message">No recent business activity to rank yet.</div>}
      </>}
    </main><aside className="growth-community-board"><h2>{period === 'risingBusinesses' ? 'RISING BUSINESSES' : 'COMMUNITY LEADERBOARD'}</h2>
      {period === 'risingBusinesses' ? <ol>{risingBusinesses.slice(0, 5).map((business, index) => <li key={business.id} className={index === 0 ? 'is-featured' : ''}><strong><span>{String(index + 1).padStart(2, '0')}</span>{business.name}</strong><small>{formatNumber(business.interactions)} recent interactions</small></li>)}</ol> : <ol>{(launches || []).slice(0, 5).map((launch, index) => <li key={launch.id} className={index === 0 ? 'is-featured' : ''}><strong><span>{String(launch.rank || index + 1).padStart(2, '0')}</span>{launch.brandName}</strong><small>{launch.title}</small></li>)}</ol>}
      {!loading && !error && !(period === 'risingBusinesses' ? risingBusinesses.length : launches?.length) && <p className="growth-board-empty">The leaderboard will take shape as activity comes in.</p>}
    </aside></div>
    <p className="growth-trending-disclaimer"><Flame size={14} aria-hidden="true" />{data?.note || 'Activity rankings are provisional and are not a quality score.'}</p>
  </section>
}

const kindTone = (kind: string) => /launch|trending|reminder/u.test(kind) ? 'is-terracotta' : /follow|save|like|share/u.test(kind) ? 'is-sage' : 'is-stone'
const notificationDate = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
type NotificationFilter = 'all' | 'unread' | 'follows' | 'collections' | 'reminders' | 'updates'
const notificationFilters: Array<{ value: NotificationFilter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }, { value: 'follows', label: 'Follows' },
  { value: 'collections', label: 'Collections' }, { value: 'reminders', label: 'Reminders' }, { value: 'updates', label: 'Updates' },
]
const matchesNotificationFilter = (item: Notification, filter: NotificationFilter) => {
  if (filter === 'all') return true
  if (filter === 'unread') return !item.readAt
  const kind = item.kind.toLowerCase()
  if (filter === 'follows') return kind.includes('follow')
  if (filter === 'collections') return /collection|save/u.test(kind)
  if (filter === 'reminders') return /reminder|launch_ending/u.test(kind)
  return !/follow|collection|save|reminder|launch_ending/u.test(kind)
}

export function GrowthNotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [authRequired, setAuthRequired] = useState(false)
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const load = async () => {
    try {
      const result = await api<NotificationsResponse>('/me/notifications')
      setItems(result.items); setUnreadCount(result.unreadCount); setNextCursor(result.nextCursor || null); setError(''); setAuthRequired(false)
    } catch (err) { setError(requestError(err)); setAuthRequired(isAuthError(err)) }
  }
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void api<NotificationsResponse>('/me/notifications')
      .then(result => { if (active) { setItems(result.items); setUnreadCount(result.unreadCount); setNextCursor(result.nextCursor || null); setError(''); setAuthRequired(false) } })
      .catch(err => { if (active) { setError(requestError(err)); setAuthRequired(isAuthError(err)) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reloadKey])
  const markOne = async (id: string) => {
    setBusyId(id); setError('')
    try { await api(`/me/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', body: jsonBody({}) }); await load() }
    catch (err) { setError(requestError(err)); setAuthRequired(isAuthError(err)) }
    finally { setBusyId('') }
  }
  const markAll = async () => {
    setMarkingAll(true); setError('')
    try { await api('/me/notifications/read-all', { method: 'POST', body: jsonBody({}) }); await load() }
    catch (err) { setError(requestError(err)); setAuthRequired(isAuthError(err)) }
    finally { setMarkingAll(false) }
  }
  const loadOlder = async () => {
    if (!nextCursor) return
    setLoadingMore(true); setError('')
    try {
      const params = new URLSearchParams({ cursor: nextCursor })
      const result = await api<NotificationsResponse>(`/me/notifications?${params.toString()}`)
      setItems(current => [...current, ...result.items]); setUnreadCount(result.unreadCount); setNextCursor(result.nextCursor || null); setAuthRequired(false)
    } catch (err) { setError(requestError(err)); setAuthRequired(isAuthError(err)) }
    finally { setLoadingMore(false) }
  }
  const unreadItems = items.filter(item => !item.readAt)
  const filteredItems = items.filter(item => matchesNotificationFilter(item, filter))
  const activeFilterLabel = notificationFilters.find(item => item.value === filter)?.label || 'All'
  return <section className="growth-page-wrap growth-notifications-page">
    <div className="growth-notifications-heading"><PageHeading eyebrow="YOUR COMMUNITY, IN ONE PLACE" title="Notifications" description="Launch news, community activity, reminders, and account updates." /><span className="growth-unread-badge">{formatNumber(unreadCount)} unread</span></div>
    <div className="growth-notifications-layout"><main className="growth-notification-list-wrap">
      <div className="growth-notification-toolbar"><span>RECENT UPDATES</span><button type="button" onClick={() => void markAll()} disabled={!unreadCount || markingAll}>{markingAll ? 'Marking…' : 'Mark all as read'}</button></div>
      <div className="growth-notification-filters" role="group" aria-label="Filter notifications">{notificationFilters.map(option => <button type="button" key={option.value} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}</div>
      {loading && <div className="growth-api-message" role="status">Loading your notifications…</div>}
      {error && <div className="growth-api-message is-error" role="alert"><span>{error}</span>{authRequired && <Link to="/test/account">Sign in to view your notifications.</Link>}<button type="button" className="growth-retry-button" onClick={() => setReloadKey(current => current + 1)}>Try again</button></div>}
      {!loading && !error && filteredItems.length > 0 && <div className="growth-notification-list">{filteredItems.map(item => <article className={`growth-notification-row ${kindTone(item.kind)}${item.readAt ? '' : ' is-unread'}`} key={item.id}>
        <span className="growth-notification-icon" aria-hidden="true">{item.readAt ? <Check size={16} /> : /launch|reminder/u.test(item.kind) ? <CalendarDays size={16} /> : <Bell size={16} />}</span><div className="growth-notification-copy"><span className="growth-notification-kind">{item.kind.replaceAll('_', ' ')}</span><h2>{item.subject}</h2><p>{item.message}</p><time dateTime={item.createdAt}>{notificationDate(item.createdAt)}</time></div>{!item.readAt && <button type="button" className="growth-mark-read" onClick={() => void markOne(item.id)} disabled={busyId === item.id} aria-label={`Mark as read: ${item.subject}`}>{busyId === item.id ? 'Saving…' : <><Check size={14} aria-hidden="true" /> Mark read</>}</button>}
      </article>)}</div>}
      {!loading && !error && items.length > 0 && !filteredItems.length && <div className="growth-notification-empty is-filtered" role="status"><h2>No {activeFilterLabel.toLowerCase()} updates in this view</h2><p>Try another filter or load older updates.</p></div>}
      {!loading && !error && nextCursor && <button type="button" className="growth-load-older" onClick={() => void loadOlder()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load older notifications'}</button>}
      {!loading && !error && !items.length && <div className="growth-notification-empty"><span><Sparkles size={20} aria-hidden="true" /></span><h2>You’re all caught up</h2><p>New community activity and account updates will appear here.</p></div>}
      {!loading && !error && items.length > 0 && <p className="growth-privacy-note"><Check size={14} aria-hidden="true" /> Notifications are private to your signed-in account.</p>}
    </main><aside className="growth-notification-side"><article className="growth-state-card is-sage"><strong><Check size={16} aria-hidden="true" /> Your updates, together</strong><p>Launch reminders and community activity appear in this feed.</p></article><article className="growth-state-card is-terracotta"><strong>{unreadCount ? `${formatNumber(unreadCount)} to read` : 'All caught up'}</strong><p>{unreadItems.length ? 'Mark an update read when you’re ready.' : 'There are no unread updates right now.'}</p></article><Link className="growth-calendar-shortcut" to="/test/samples/launch-calendar"><CalendarDays size={16} aria-hidden="true" /><span>Explore upcoming launches</span><ArrowRight size={15} aria-hidden="true" /></Link></aside></div>
  </section>
}
