import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Flag,
  Globe2,
  LockKeyhole,
  Mail,
  MapPin,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { DEMO_FOUNDERS, DEMO_LAUNCHES, DEMO_PUBLIC_BRANDS } from './demo'
import { AppShell } from './ui'
import './community.css'

const COLLECTIONS = [
  { id: 'slow-made', name: 'Slow-made, well-loved', description: 'Thoughtful pieces from independent makers.', slugs: ['kala-clay-monsoon-objects', 'rangrez-repairable-textiles'], visibility: 'public' as const },
  { id: 'everyday-rituals', name: 'Everyday rituals', description: 'Small ideas for more mindful routines.', slugs: ['nila-botanics-skin-oil', 'mitti-and-more-cold-pressed'], visibility: 'private' as const },
  { id: 'neighbourhood', name: 'Growing together', description: 'Local projects bringing people closer.', slugs: ['aangan-community-gardens', 'karigar-market-maker-tools'], visibility: 'public' as const },
]

type Visibility = 'public' | 'private'
type FeedMode = 'for-you' | 'following'
type ProfileTab = 'activity' | 'collections' | 'about'

function FollowButton({ following, onClick, compact = false }: { following: boolean; onClick: () => void; compact?: boolean }) {
  return <button type="button" className={`community-follow-button${following ? ' is-following' : ''}${compact ? ' is-compact' : ''}`} onClick={onClick} aria-pressed={following}>
    {following ? <><Check size={15} aria-hidden="true" />Following</> : <><Plus size={15} aria-hidden="true" />Follow</>}
  </button>
}

type CommunityUser = { id: string; emailVerified: boolean }
type CommunityCategory = { id: string; name: string; slug: string }
type ContentReport = {
  id: string; subjectType: string; subjectId: string; reason: string; details?: string; status: string; createdAt: string;
  subjectPreview?: { name?: string; title?: string; brandName?: string; status?: string; unavailable?: boolean }
}
type ReviewReport = { id: string; reason: string; createdAt: string; reviewId: string; brandId: string; rating: number }
type ReportStatus = 'open' | 'under_review'
type ContentReportAction = 'dismiss' | 'request_changes' | 'pause' | 'remove' | 'restore'

async function communityApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`/api${path}`, { ...options, headers, credentials: 'include' })
  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } } & T
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Request failed (${response.status}).`) as Error & { status: number }
    error.status = response.status
    throw error
  }
  return payload
}

function requestMessage(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.' }

function BusinessBookmarkStatus({ user, brandSlug }: { user?: CommunityUser | null; brandSlug: string }) {
  const statusId = `community-business-bookmark-${brandSlug}-status`
  const message = !user
    ? 'Business bookmarks are not supported yet. Signing in will not enable this feature.'
    : !user.emailVerified
      ? 'Business bookmarks are not supported yet. Email verification will not enable this feature.'
      : 'Business bookmarks are not supported yet for any account; verification does not enable them.'

  return <div className="community-business-bookmark">
    <button type="button" className="community-business-bookmark-button" disabled aria-describedby={statusId}>
      <Bookmark size={14} aria-hidden="true" />Save business
    </button>
    <p id={statusId} className="community-business-bookmark-status" role="status">{message}</p>
  </div>
}

function CategoryFollowPanel({ user }: { user?: CommunityUser | null }) {
  const [categories, setCategories] = useState<CommunityCategory[]>([])
  const [followState, setFollowState] = useState<{ userId: string; ids: string[] }>({ userId: '', ids: [] })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const followingIds = followState.userId === user?.id ? followState.ids : []

  useEffect(() => {
    let active = true
    void communityApi<{ categories: CommunityCategory[] }>('/categories')
      .then(result => { if (active) setCategories(result.categories) })
      .catch(err => { if (active) setError(requestMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const userId = user?.id
    if (!userId) return () => { active = false }
    void communityApi<{ items: Array<{ targetType: string; targetId: string }> }>('/me/follows')
      .then(result => { if (active) setFollowState({ userId, ids: result.items.filter(item => item.targetType === 'category').map(item => item.targetId) }) })
      .catch(err => { if (active) setNotice(requestMessage(err)) })
    return () => { active = false }
  }, [user?.id])

  async function toggle(category: CommunityCategory) {
    if (!user) { setNotice('Sign in to follow categories.'); return }
    if (!user.emailVerified) { setNotice('Verify your account before following categories.'); return }
    const following = followingIds.includes(category.id)
    setBusyId(category.id)
    setNotice('')
    try {
      await communityApi(`/me/follows/category/${encodeURIComponent(category.id)}`, { method: following ? 'DELETE' : 'PUT', ...(following ? {} : { body: '{}' }) })
      setFollowState(current => {
        const ids = current.userId === user.id ? current.ids : []
        return { userId: user.id, ids: following ? ids.filter(id => id !== category.id) : [...ids, category.id] }
      })
    } catch (err) { setNotice(requestMessage(err)) }
    finally { setBusyId('') }
  }

  return <section className="community-sidebar-card community-category-card" aria-labelledby="community-category-title">
    <div className="community-sidebar-heading"><div><span className="community-eyebrow">FIND YOUR THREAD</span><h2 id="community-category-title">Categories to follow</h2></div><Compass size={17} aria-hidden="true" /></div>
    <p className="community-category-intro">Follow a category to include its public launches in your API-backed Following feed.</p>
    {loading && <p className="community-category-state" role="status">Loading categories…</p>}
    {error && <p className="community-category-state is-error" role="status">{error}</p>}
    {!loading && !error && categories.length === 0 && <p className="community-category-state">No categories are available right now.</p>}
    {categories.length > 0 && <ul className="community-category-list">{categories.map(category => {
      const following = followingIds.includes(category.id)
      return <li className="community-category-row" key={category.id}><span>{category.name}</span><button type="button" className={`community-follow-button is-compact${following ? ' is-following' : ''}`} aria-label={`${following ? 'Unfollow' : 'Follow'} ${category.name} category`} aria-pressed={following} disabled={busyId === category.id} onClick={() => void toggle(category)}>{following ? <><Check size={13} aria-hidden="true" />Following</> : <><Plus size={13} aria-hidden="true" />Follow</>}</button></li>
    })}</ul>}
    {!user && <p className="community-category-state">Sign in with a verified account to save category follows.</p>}
    {!user?.emailVerified && user && <p className="community-category-state">A verified account is required to follow categories.</p>}
    {notice && <p className="community-category-state" role="status">{notice}</p>}
  </section>
}

function moderatorError(error: unknown) {
  const status = (error as Error & { status?: number })?.status
  if (status === 401) return 'Sign in to check moderator access. The server controls authorization.'
  if (status === 403) return 'The server denied moderator access. No moderator role is inferred in this UI.'
  return requestMessage(error)
}

function ModeratorQueuePanel({ user }: { user?: CommunityUser | null }) {
  const [reportStatus, setReportStatus] = useState<ReportStatus>('open')
  const [contentReports, setContentReports] = useState<ContentReport[]>([])
  const [reviewReports, setReviewReports] = useState<ReviewReport[]>([])
  const [contentError, setContentError] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [actionById, setActionById] = useState<Record<string, ContentReportAction>>({})
  const [reasonById, setReasonById] = useState<Record<string, string>>({})
  const [contentFeedback, setContentFeedback] = useState<Record<string, string>>({})
  const [reviewFeedback, setReviewFeedback] = useState<Record<string, string>>({})
  const [busyActionId, setBusyActionId] = useState('')

  async function loadQueue(status: ReportStatus = reportStatus) {
    if (!user) { setContentError('Sign in to check moderator access.'); setHasLoaded(true); return }
    setLoading(true)
    setContentError('')
    setReviewError('')
    const [contentResult, reviewResult] = await Promise.allSettled([
      communityApi<{ items: ContentReport[] }>(`/admin/reports?status=${status}`),
      communityApi<{ items: ReviewReport[] }>('/admin/reviews/reports'),
    ])
    if (contentResult.status === 'fulfilled') setContentReports(contentResult.value.items)
    else { setContentReports([]); setContentError(moderatorError(contentResult.reason)) }
    if (reviewResult.status === 'fulfilled') setReviewReports(reviewResult.value.items)
    else { setReviewReports([]); setReviewError(moderatorError(reviewResult.reason)) }
    setHasLoaded(true)
    setLoading(false)
  }

  async function actOnContent(report: ContentReport, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const reason = (reasonById[report.id] || '').trim()
    if (reason.length < 3 || reason.length > 1000) {
      setContentFeedback(current => ({ ...current, [report.id]: 'Enter a reason from 3 to 1000 characters.' }))
      return
    }
    setBusyActionId(report.id)
    setContentFeedback(current => ({ ...current, [report.id]: '' }))
    try {
      await communityApi(`/admin/reports/${encodeURIComponent(report.id)}/actions`, { method: 'POST', body: JSON.stringify({ action: actionById[report.id] || 'dismiss', reason }) })
      setContentFeedback(current => ({ ...current, [report.id]: 'Moderation action submitted.' }))
      await loadQueue(reportStatus)
    } catch (err) { setContentFeedback(current => ({ ...current, [report.id]: moderatorError(err) })) }
    finally { setBusyActionId('') }
  }

  async function actOnReview(report: ReviewReport, action: 'hide' | 'restore') {
    setBusyActionId(report.reviewId)
    setReviewFeedback(current => ({ ...current, [report.reviewId]: '' }))
    try {
      await communityApi(`/admin/reviews/${encodeURIComponent(report.reviewId)}/actions`, { method: 'POST', body: JSON.stringify({ action }) })
      setReviewFeedback(current => ({ ...current, [report.reviewId]: `Review ${action} action submitted.` }))
      await loadQueue(reportStatus)
    } catch (err) { setReviewFeedback(current => ({ ...current, [report.reviewId]: moderatorError(err) })) }
    finally { setBusyActionId('') }
  }

  return <details className="community-sidebar-card community-moderation-card">
    <summary><ShieldCheck size={16} aria-hidden="true" /><span>Moderator queue</span><ChevronDown size={14} aria-hidden="true" /></summary>
    <p className="community-moderation-intro">Queue access and every action are checked by the server; this page does not infer a moderator role.</p>
    {!user ? <p className="community-moderation-state">Sign in before checking moderator access. <Link to="/test/account">Open account sign-in</Link></p> : <>
      <div className="community-moderation-toolbar"><label htmlFor="community-report-status">Content reports</label><select id="community-report-status" value={reportStatus} onChange={event => { const status = event.target.value as ReportStatus; setReportStatus(status); if (hasLoaded) void loadQueue(status) }}><option value="open">Open</option><option value="under_review">Under review</option></select></div>
      <button type="button" className="button button-secondary community-moderation-refresh" disabled={loading} onClick={() => void loadQueue()}>{loading ? 'Loading queues…' : hasLoaded ? 'Refresh queues' : 'Load queues'}</button>
      {contentError && <p className="community-moderation-state is-error" role="status">Content queue: {contentError}</p>}
      {hasLoaded && !contentError && (contentReports.length ? <ul className="community-report-list">{contentReports.map(report => {
        const preview = report.subjectPreview
        const subjectName = preview?.name || preview?.title || `${report.subjectType} ${report.subjectId}`
        return <li className="community-report-item" key={report.id}><div className="community-report-heading"><Flag size={13} aria-hidden="true" /><strong>{subjectName}</strong><span>{report.status.replaceAll('_', ' ')}</span></div><p>{report.subjectType} · {report.reason.replaceAll('_', ' ')}{report.details ? ` · ${report.details}` : ''}</p><form onSubmit={event => void actOnContent(report, event)}><label htmlFor={`community-action-${report.id}`}>Action</label><select id={`community-action-${report.id}`} value={actionById[report.id] || 'dismiss'} onChange={event => setActionById(current => ({ ...current, [report.id]: event.target.value as ContentReportAction }))}><option value="dismiss">Dismiss</option><option value="request_changes">Request changes</option><option value="pause">Pause content</option><option value="remove">Remove content</option><option value="restore">Restore content</option></select><label htmlFor={`community-reason-${report.id}`}>Moderator reason</label><textarea id={`community-reason-${report.id}`} minLength={3} maxLength={1000} rows={2} value={reasonById[report.id] || ''} onChange={event => setReasonById(current => ({ ...current, [report.id]: event.target.value }))} required /><button type="submit" className="button button-secondary" disabled={loading || busyActionId === report.id || (reasonById[report.id] || '').trim().length < 3}>Apply action</button>{contentFeedback[report.id] && <span role="status">{contentFeedback[report.id]}</span>}</form></li>
      })}</ul> : <p className="community-moderation-state">No {reportStatus.replace('_', ' ')} content reports.</p>)}
      {reviewError && <p className="community-moderation-state is-error" role="status">Review queue: {reviewError}</p>}
      {hasLoaded && !reviewError && (reviewReports.length ? <><h3 className="community-review-queue-title">Review reports</h3><ul className="community-report-list">{reviewReports.map(report => <li className="community-report-item" key={report.id}><div className="community-report-heading"><Flag size={13} aria-hidden="true" /><strong>Review · {report.rating}/5</strong><span>{new Date(report.createdAt).toLocaleDateString()}</span></div><p>{report.reason.replaceAll('_', ' ')} · brand {report.brandId} · review {report.reviewId}</p><div className="community-moderation-actions"><button type="button" className="button button-secondary" disabled={busyActionId === report.reviewId} onClick={() => void actOnReview(report, 'hide')}>Hide review</button><button type="button" className="button button-secondary" disabled={busyActionId === report.reviewId} onClick={() => void actOnReview(report, 'restore')}>Restore review</button></div>{reviewFeedback[report.reviewId] && <p role="status">{reviewFeedback[report.reviewId]}</p>}</li>)}</ul></> : <p className="community-moderation-state">No open review reports.</p>)}
    </>}
  </details>
}

function ContactPreview({ brandName, onClose }: { brandName: string; onClose: () => void }) {
  const [topic, setTopic] = useState('A question about the business')
  const [message, setMessage] = useState('')
  const [previewReady, setPreviewReady] = useState(false)

  const preparePreview = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPreviewReady(true)
  }

  return <div className="community-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="community-contact-dialog" role="dialog" aria-modal="true" aria-labelledby="community-contact-title">
      <div className="community-dialog-heading"><div className="community-dialog-icon"><MessageCircle size={19} aria-hidden="true" /></div><button type="button" className="community-icon-button" onClick={onClose} aria-label="Close contact preview"><X size={19} /></button></div>
      <span className="community-eyebrow">LOCAL INTERACTION PREVIEW</span>
      <h2 id="community-contact-title">Contact {brandName}</h2>
      <p className="community-dialog-copy">Compose a sample note to see the business-contact flow. Nothing will be sent, saved, or shared.</p>
      <form onSubmit={preparePreview}>
        <label className="community-field-label" htmlFor="community-contact-topic">What is this about?</label>
        <select id="community-contact-topic" value={topic} onChange={(event) => { setTopic(event.target.value); setPreviewReady(false) }}>
          <option>A question about the business</option>
          <option>Partnership idea</option>
          <option>Press or collaboration</option>
        </select>
        <label className="community-field-label" htmlFor="community-contact-message">Sample message</label>
        <textarea id="community-contact-message" rows={4} maxLength={280} value={message} onChange={(event) => { setMessage(event.target.value); setPreviewReady(false) }} placeholder="Write a fictional sample note…" />
        <p className="community-privacy-hint">Preview only. Please don’t enter personal or sensitive information.</p>
        <button type="submit" className="button button-primary community-preview-submit"><Send size={15} aria-hidden="true" />Preview contact request</button>
      </form>
      {previewReady && <div className="community-contact-result" role="status" aria-live="polite"><Check size={17} aria-hidden="true" /><div><strong>Sample preview ready</strong><span>{topic} · local only; no delivery or persistence</span></div></div>}
    </section>
  </div>
}

function CommunityPageShell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  return embedded ? <>{children}</> : <AppShell>{children}</AppShell>
}

function CommunityHubPreview({ user }: { user?: CommunityUser | null }) {
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const featuredLaunch = DEMO_LAUNCHES[2]
  const people = DEMO_FOUNDERS.slice(0, 4).map(founder => ({
    founder,
    brand: DEMO_PUBLIC_BRANDS.find(item => item.founders.some(person => person.id === founder.id)),
  }))
  const stories = DEMO_LAUNCHES.slice(0, 3)
  const toggleFollow = (id: string) => setFollowingIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  return <div className="content-width standard-page community-page community-hub-page" data-testid="community-hub-page">
    <div className="community-preview-note"><span className="community-preview-mark"><Users size={15} aria-hidden="true" /></span><span><strong>Community preview</strong> · public community view · fictional sample</span></div>
    <header className="community-hub-heading"><div><span className="community-eyebrow">PUBLIC COMMUNITY</span><h1>Community</h1></div><p>Meet makers, share stories and join conversations from across the community.</p></header>
    <div className="community-hub-layout">
      <main className="community-hub-main">
        <section className="community-hub-hero" aria-labelledby="community-hub-hero-title">
          <div><span className="community-eyebrow">MADE BY INDIA. MADE FOR ALL.</span><h2 id="community-hub-hero-title">Made together.<br />Grows together.</h2><p>A public space to meet makers, share stories, and join conversations from Ahmedabad and beyond.</p><Link className="community-hub-hero-link" to="/test/nearby">Discover makers <ArrowRight size={15} aria-hidden="true" /></Link></div>
          <img src="/images/aarambh-home-hero.jpg" alt="A fictional maker shaping a clay vessel in a sunlit studio" />
        </section>

        <section className="community-hub-section" aria-labelledby="community-hub-people-title">
          <div className="community-hub-section-heading"><div><span className="community-eyebrow">PEOPLE TO MEET</span><h2 id="community-hub-people-title">People to meet</h2></div><Link to="/test/nearby">View all <ArrowRight size={14} aria-hidden="true" /></Link></div>
          <div className="community-hub-people-grid">{people.map(({ founder, brand }) => <article className="community-hub-person" key={founder.id}>
            <Link to={`/founder/${founder.id}`} className="community-hub-person-image" aria-label={`Open synthetic founder profile for ${founder.displayName}`}>
              {brand?.logoUrl ? <img src={brand.logoUrl} alt="" loading="lazy" /> : <span>{founder.displayName.slice(0, 1)}</span>}
            </Link>
            <strong>{founder.displayName}</strong><span>{founder.role || 'Independent maker'}</span>
            <FollowButton compact following={followingIds.includes(founder.id)} onClick={() => toggleFollow(founder.id)} />
          </article>)}</div>
        </section>

        <section className="community-hub-section" aria-labelledby="community-hub-stories-title">
          <div className="community-hub-section-heading"><div><span className="community-eyebrow">STORIES FROM THE COMMUNITY</span><h2 id="community-hub-stories-title">Stories from makers</h2></div><Link to="/">View all <ArrowRight size={14} aria-hidden="true" /></Link></div>
          <div className="community-hub-stories">{stories.map(launch => <article className="community-hub-story" key={launch.id}>
            <Link to={`/launch/${launch.slug}`} className="community-hub-story-image" aria-label={`Read ${launch.title}`}><img src={launch.images[0]?.url} alt={launch.images[0]?.altText || ''} loading="lazy" /></Link>
            <div><span>{launch.category} · {launch.location?.city || 'India'}</span><h3><Link to={`/launch/${launch.slug}`}>{launch.title}</Link></h3><p>{launch.summary}</p><Link className="community-hub-read-link" to={`/launch/${launch.slug}`}>Read story <ArrowRight size={13} aria-hidden="true" /></Link></div>
          </article>)}</div>
        </section>
      </main>

      <aside className="community-hub-sidebar" aria-label="Community conversations and prompts">
        {featuredLaunch && <section className="community-hub-side-card community-hub-conversation"><span className="community-eyebrow">THIS WEEK'S CONVERSATION</span><img src={featuredLaunch.images[0]?.url} alt="" loading="lazy" /><h2>{featuredLaunch.title}</h2><p>{featuredLaunch.summary}</p><span className="community-hub-event-meta"><MapPin size={14} aria-hidden="true" />Fictional maker story · local sample</span><Link to={`/launch/${featuredLaunch.slug}`}>Explore the story <ArrowRight size={14} aria-hidden="true" /></Link></section>}
        <section className="community-hub-side-card community-hub-prompt"><span className="community-eyebrow">COMMUNITY PROMPT</span><h2>Share what you’re learning.</h2><p>Share your process, tools or a lesson learned with the community.</p>{user ? <span className="community-hub-prompt-note">Signed in as {user.emailVerified ? 'a verified member' : 'a synthetic member'} · preview only</span> : <Link to="/test/account">Sign in to join the conversation <ArrowRight size={14} aria-hidden="true" /></Link>}</section>
        <section className="community-hub-side-card community-hub-activity"><div className="community-hub-section-heading"><div><span className="community-eyebrow">COMMUNITY FEED</span><h2>Recent stories</h2></div></div>{DEMO_LAUNCHES.slice(3, 5).map(launch => <Link key={launch.id} to={`/launch/${launch.slug}`} className="community-hub-activity-row"><span className="community-mini-avatar">{launch.founders[0]?.displayName.slice(0, 1)}</span><span><strong>{launch.brand.name}</strong><small>{launch.title}</small></span><ArrowRight size={14} aria-hidden="true" /></Link>)}</section>
      </aside>
    </div>
  </div>
}

export function CommunityProfilePage({ founderId = DEMO_FOUNDERS[0]?.id, embedded = false, user }: { founderId?: string; embedded?: boolean; user?: CommunityUser | null }) {
  const location = useLocation()
  const founder = DEMO_FOUNDERS.find((item) => item.id === founderId) ?? DEMO_FOUNDERS[0]
  const [activeTab, setActiveTab] = useState<ProfileTab>('activity')
  const [feedMode, setFeedMode] = useState<FeedMode>('for-you')
  const [followingIds, setFollowingIds] = useState<string[]>(['sample-founder-devika', 'sample-founder-meher'])
  const [visibilityById, setVisibilityById] = useState<Record<string, Visibility>>(() => Object.fromEntries(COLLECTIONS.map((collection) => [collection.id, collection.visibility])))
  const [savedCollectionIds, setSavedCollectionIds] = useState<string[]>(['neighbourhood'])
  const [contactOpen, setContactOpen] = useState(false)

  const relatedBrands = DEMO_PUBLIC_BRANDS.filter((brand) => brand.founders.some((item) => item.id === founder.id))
  const profileLaunches = DEMO_LAUNCHES.filter((launch) => launch.founders.some((item) => item.id === founder.id))
  const makerImage = profileLaunches[0]?.images[0]
  const visibleFeed = useMemo(() => DEMO_LAUNCHES.filter((launch) => feedMode === 'for-you' || launch.founders.some((item) => followingIds.includes(item.id))), [feedMode, followingIds])
  const suggestions = DEMO_FOUNDERS.filter((item) => item.id !== founder.id).slice(0, 4)
  const primaryBrand = relatedBrands[0]
  const publicCollection = COLLECTIONS.find((collection) => (visibilityById[collection.id] ?? collection.visibility) === 'public')
  const publicCollectionLaunches = publicCollection?.slugs.map((slug) => DEMO_LAUNCHES.find((launch) => launch.slug === slug)).filter((launch): launch is (typeof DEMO_LAUNCHES)[number] => Boolean(launch)) ?? []

  if (embedded && location.pathname === '/test/samples/community') return <CommunityHubPreview user={user} />
  if (!founder) return <AppShell><div className="content-width standard-page"><h1>Community profile unavailable</h1><p>This sample profile is not in the local synthetic collection.</p></div></AppShell>

  const toggleFollow = (id: string) => setFollowingIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleVisibility = (collectionId: string) => setVisibilityById((current) => ({ ...current, [collectionId]: current[collectionId] === 'private' ? 'public' : 'private' }))
  const toggleSaved = (collectionId: string) => setSavedCollectionIds((current) => current.includes(collectionId) ? current.filter((item) => item !== collectionId) : [...current, collectionId])

  return <CommunityPageShell embedded={embedded}>
    <div className="content-width standard-page community-page">
      <div className="community-preview-note"><span className="community-preview-mark"><Users size={15} aria-hidden="true" /></span><span><strong>Community preview</strong> · synthetic profile and local-only interactions</span></div>

      <section className="community-profile-hero" aria-labelledby="community-profile-title">
        <figure className="community-maker-photo">
          {makerImage ? <img src={makerImage.url} alt={makerImage.altText} /> : <span className="community-maker-placeholder" aria-hidden="true">{founder.displayName.charAt(0)}</span>}
          <figcaption><span>STUDIO NOTES</span><strong>{primaryBrand?.name ?? 'Independent maker'}</strong></figcaption>
        </figure>
        <div className="community-profile-copy">
          <span className="tag tag-neutral">Synthetic founder profile</span>
          <h1 id="community-profile-title">{founder.displayName}</h1>
          <p className="community-profile-role">{founder.role || 'Independent maker'}</p>
          <p className="community-profile-bio">{founder.bio}</p>
          {(founder.city || founder.state) && <p className="community-location"><MapPin size={15} aria-hidden="true" />{[founder.city, founder.state].filter(Boolean).join(', ')}</p>}
          <div className="community-profile-stats" aria-label="Synthetic sample profile stats">
            <span><strong>{followingIds.length + 18}</strong> following</span><span><strong>38</strong> followers <small>sample</small></span><span><strong>{profileLaunches.length}</strong> launches</span>
          </div>
        </div>
        <div className="community-profile-actions">
          <FollowButton following={followingIds.includes(founder.id)} onClick={() => toggleFollow(founder.id)} />
          {primaryBrand && <button type="button" className="button button-secondary community-contact-button" onClick={() => setContactOpen(true)}><Mail size={15} aria-hidden="true" />Contact {primaryBrand.name}</button>}
        </div>
      </section>

      <nav className="community-tabs" aria-label="Profile sections" role="tablist">
        {([['activity', 'Activity'], ['collections', 'Collections'], ['about', 'About']] as const).map(([tab, label]) => <button type="button" role="tab" key={tab} id={`community-tab-${tab}`} aria-selected={activeTab === tab} aria-controls={`community-panel-${tab}`} className={`community-tab${activeTab === tab ? ' is-active' : ''}`} onClick={() => setActiveTab(tab)}>{label}{tab === 'collections' && <span className="community-tab-count">{COLLECTIONS.length}</span>}</button>)}
      </nav>

      <div className="community-layout">
        <div className="community-main-column">
          {activeTab === 'activity' && <section id="community-panel-activity" className="community-panel" role="tabpanel" aria-labelledby="community-tab-activity">
            <div className="community-section-heading"><div><span className="community-eyebrow">A LOCAL SAMPLE FEED</span><h2>From people you follow</h2><p className="community-section-subtitle">Launch notes, maker updates and generous recommendations.</p></div><span className="community-sample-count">{visibleFeed.length} sample posts</span></div>
            <div className="community-feed-switch" role="group" aria-label="Choose community feed">
              <button type="button" aria-pressed={feedMode === 'for-you'} className={feedMode === 'for-you' ? 'is-selected' : ''} onClick={() => setFeedMode('for-you')}><Compass size={15} aria-hidden="true" />For you</button>
              <button type="button" aria-pressed={feedMode === 'following'} className={feedMode === 'following' ? 'is-selected' : ''} onClick={() => setFeedMode('following')}><Users size={15} aria-hidden="true" />Following</button>
            </div>
            {visibleFeed.length > 0 ? <div className="community-feed-list">{visibleFeed.map((launch, index) => {
              const author = launch.founders[0]
              return <article className="community-activity-card" key={launch.id}>
                <div className="community-activity-topline"><span className="community-mini-avatar">{author.displayName.charAt(0)}</span><div><strong>{author.displayName}</strong><span>{index === 0 ? 'shared a new launch' : 'added to the community'} · sample activity</span></div><span className="tag tag-category">{launch.category}</span></div>
                <Link to={`/launch/${launch.slug}`} className="community-activity-launch"><img src={launch.images[0]?.url} alt="" loading="lazy" /><span><small>{launch.brand.name}</small><strong>{launch.title}</strong><span>{launch.summary}</span></span><ArrowRight size={17} aria-hidden="true" /></Link>
                <div className="community-activity-footer"><span><MessageCircle size={14} aria-hidden="true" /> Local demo discussion</span><Link to={`/launch/${launch.slug}`}>View launch <ArrowRight size={13} aria-hidden="true" /></Link></div>
              </article>
            })}</div> : <div className="community-empty-feed"><Users size={20} aria-hidden="true" /><strong>Your following feed starts here</strong><span>Follow a few synthetic founders to see sample launch activity here.</span><Link to="/test/nearby" className="button button-primary community-empty-action"><Compass size={15} aria-hidden="true" />Discover makers<ArrowRight size={14} aria-hidden="true" /></Link></div>}
          </section>}

          {activeTab === 'collections' && <section id="community-panel-collections" className="community-panel" role="tabpanel" aria-labelledby="community-tab-collections">
            <div className="community-section-heading"><div><span className="community-eyebrow">CURATED BY {founder.displayName.toLocaleUpperCase()}</span><h2>Collections</h2></div><span className="tag tag-neutral">Local sample</span></div>
            <p className="community-section-intro">A few collections to make independent ideas easier to revisit. Visibility changes are temporary in this preview.</p>
            <div className="community-collection-grid">{COLLECTIONS.map((collection) => {
              const visibility = visibilityById[collection.id] ?? collection.visibility
              const collectionLaunches = collection.slugs.map((slug) => DEMO_LAUNCHES.find((launch) => launch.slug === slug)).filter((launch): launch is (typeof DEMO_LAUNCHES)[number] => Boolean(launch))
              const isSaved = savedCollectionIds.includes(collection.id)
              return <article className="community-collection-card" key={collection.id}>
                <div className="community-collection-art" aria-hidden="true">{collectionLaunches.slice(0, 2).map((launch) => <img key={launch.id} src={launch.images[0]?.url} alt="" loading="lazy" />)}</div>
                <div className="community-collection-body"><div className="community-collection-meta"><span className={`community-visibility ${visibility}`}><>{visibility === 'private' ? <LockKeyhole size={12} aria-hidden="true" /> : <Globe2 size={12} aria-hidden="true" />}{visibility === 'private' ? 'Private' : 'Public'}</></span><span>{collectionLaunches.length} ideas</span></div>
                  <h3>{collection.name}</h3><p>{collection.description}</p>
                  <div className="community-collection-launches">{collectionLaunches.map((launch) => <Link to={`/launch/${launch.slug}`} key={launch.id}>{launch.title}<ArrowRight size={13} aria-hidden="true" /></Link>)}</div>
                  <div className="community-collection-actions"><button type="button" className="community-text-button" onClick={() => toggleVisibility(collection.id)}>{visibility === 'private' ? <><Globe2 size={14} aria-hidden="true" />Make public</> : <><LockKeyhole size={14} aria-hidden="true" />Make private</>}</button><button type="button" className={`community-save-button${isSaved ? ' is-saved' : ''}`} aria-pressed={isSaved} onClick={() => toggleSaved(collection.id)}><Bookmark size={14} aria-hidden="true" />{isSaved ? 'Saved' : 'Save'}</button></div>
                </div>
              </article>
            })}</div>
          </section>}

          {activeTab === 'about' && <section id="community-panel-about" className="community-panel" role="tabpanel" aria-labelledby="community-tab-about">
            <div className="community-section-heading"><div><span className="community-eyebrow">PROFILE DETAILS</span><h2>About {founder.displayName}</h2></div></div>
            <div className="community-about-card"><p>{founder.bio}</p><div className="community-about-detail"><MapPin size={16} aria-hidden="true" /><span>{[founder.city, founder.state].filter(Boolean).join(', ') || 'Location not listed'}</span></div><div className="community-about-detail"><Compass size={16} aria-hidden="true" /><span>Interested in independent brands and local ideas</span></div></div>
            <div className="community-section-heading community-brands-heading"><div><span className="community-eyebrow">SYNTHETIC PROFILE LINKS</span><h2>Related brands</h2></div></div>
            {relatedBrands.length > 0 ? <div className="community-related-brands">{relatedBrands.map((brand) => <article className="community-business-card" key={brand.id}>
              <Link to={`/brand/${brand.slug}`} className="community-brand-card"><img src={brand.logoUrl} alt="" /><span><small>{brand.category}</small><strong>{brand.name}</strong><span>{brand.tagline || brand.description}</span></span><ArrowRight size={16} aria-hidden="true" /></Link>
              <BusinessBookmarkStatus user={user} brandSlug={brand.slug} />
            </article>)}</div> : <p className="community-muted-copy">No linked synthetic brands in this sample.</p>}
          </section>}
        </div>

        <aside className="community-sidebar" aria-label="Community profile tools">
          {activeTab === 'collections' && <section className="community-sidebar-card community-share-preview"><div className="community-sidebar-heading"><div><span className="community-eyebrow">PUBLIC SHARE PREVIEW</span><h2>Collection page</h2></div><Globe2 size={17} aria-hidden="true" /></div>
            {publicCollection ? <><div className="community-share-identity"><span className="community-visibility public"><Globe2 size={12} aria-hidden="true" />Public collection</span><h3>{publicCollection.name}</h3><p>Curated by {founder.displayName} · {publicCollectionLaunches.length} thoughtful finds</p></div>
              <div className="community-share-maker-list">{publicCollectionLaunches.slice(0, 3).map((launch) => <Link to={`/launch/${launch.slug}`} className="community-share-maker" key={launch.id}><img src={launch.images[0]?.url} alt="" loading="lazy" /><span><small>{launch.brand.name}</small><strong>{launch.title}</strong></span><ArrowRight size={15} aria-hidden="true" /></Link>)}</div>
            </> : <div className="community-share-empty"><strong>Nothing public yet</strong><span>Make one of your collections public to preview how it will appear when shared.</span></div>}
          </section>}
          <CategoryFollowPanel user={user} />
          <section className="community-sidebar-card community-suggestions-card"><div className="community-sidebar-heading"><div><span className="community-eyebrow">MEET THE MAKERS</span><h2>People to follow</h2></div><Users size={17} aria-hidden="true" /></div>
            <div className="community-suggestion-list">{suggestions.map((suggestion) => {
              const isFollowing = followingIds.includes(suggestion.id)
              return <article className="community-suggestion" key={suggestion.id}><Link to={`/founder/${suggestion.id}`} className="community-suggestion-person"><span className="community-mini-avatar">{suggestion.displayName.charAt(0)}</span><span><strong>{suggestion.displayName}</strong><small>{suggestion.city ? `${suggestion.city} · ` : ''}${suggestion.role || 'Independent maker'}</small></span></Link><FollowButton compact following={isFollowing} onClick={() => toggleFollow(suggestion.id)} /></article>
            })}</div><p className="community-sidebar-footnote">All people shown are fictional sample profiles.</p>
          </section>
          <section className="community-sidebar-card community-contact-card"><span className="community-sidebar-icon"><Mail size={17} aria-hidden="true" /></span><h2>Start a conversation</h2><p>Reach out to a sample business with a local-only contact preview.</p>{primaryBrand && <button type="button" className="button button-primary community-sidebar-contact" onClick={() => setContactOpen(true)}>Contact {primaryBrand.name}<ArrowRight size={15} aria-hidden="true" /></button>}<span className="community-no-external">No message is sent or delivered.</span></section>
          <section className="community-sidebar-card community-guidelines-card"><span className="community-eyebrow">COMMUNITY NOTE</span><h2>Make room for good ideas.</h2><p>Follow makers, collect launches, and keep conversations thoughtful. This preview uses fictional sample content only.</p><ChevronDown size={16} aria-hidden="true" className="community-guideline-mark" /></section>
          <ModeratorQueuePanel user={user} />
        </aside>
      </div>
      <aside className="community-read-only-note" aria-label="Preview and integration status"><strong>Synthetic sample feed.</strong> Profile follows, collection visibility and collection saves use temporary local state; contact previews send nothing. Category follows here use the verified-member API and feed the existing Following page. Reviews and business contact remain API-backed in their existing app surfaces. There is no separate personalized “For you” endpoint or business-only save API.</aside>
    </div>
    {contactOpen && primaryBrand && <ContactPreview brandName={primaryBrand.name} onClose={() => setContactOpen(false)} />}
  </CommunityPageShell>
}
