import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ArrowRight, BookOpen, Compass, Trophy } from 'lucide-react'
import type { LaunchCardData } from './types'

export function NaviraaMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
    <path fill="currentColor" fillRule="evenodd" d="M5 43V23a19 19 0 1 1 38 0v20H5Zm9 0h8V23a3 3 0 1 1 6 0v20h8V23a11 11 0 1 0-22 0v20Z" />
    <path fill="currentColor" d="M35 1c1.25 5.1 2.9 6.75 8 8-5.1 1.25-6.75 2.9-8 8-1.25-5.1-2.9-6.75-8-8 5.1-1.25 6.75-2.9 8-8Z" />
  </svg>
}

export function BrandWordmark() {
  return <Link to="/" className="wordmark" aria-label="Naviraa home"><NaviraaMark className="wordmark-mark" /><span>naviraa</span></Link>
}

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="site">
    <aside className="demo-mode-banner" aria-label="Demo status"><strong>Synthetic demo · non-production · read-only</strong><span>Local sample data only. Do not enter personal information.</span><Link to="/test" className="test-mode-entry">Open isolated interactive test mode</Link></aside>
    <header className="topbar"><div className="topbar-inner">
      <BrandWordmark />
      <nav className="top-links" aria-label="Public navigation">
        <NavLink to="/" end><Compass size={15} />Explore</NavLink>
        <NavLink to="/leaderboard"><Trophy size={15} />Leaderboard</NavLink>
        <NavLink to="/how-it-works" aria-label="How Naviraa works"><BookOpen size={15} /><span className="desktop-nav-label">How it works</span><span className="mobile-nav-label">About</span></NavLink>
      </nav>
      <span className="founder-tools-note" aria-disabled="true">Founder tools coming soon</span>
    </div></header>
    <main id="main-content" className="main-content">{children}</main>
    <footer className="site-footer"><span>Naviraa synthetic preview</span><span>Local fixtures · read-only · non-production</span></footer>
  </div>
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="page-heading-action">{action}</div>}</div>
}

export function LaunchCard({ launch }: { launch: LaunchCardData }) {
  return <article className="launch-card">
    <Link className="launch-card-image-link" to={`/launch/${launch.slug}`} aria-label={`Open synthetic launch: ${launch.title}`}>
      <img src={launch.images[0]?.url} alt={launch.images[0]?.altText || ''} loading="lazy" />
    </Link>
    <div className="launch-card-content">
      <div className="card-kicker-row"><span className="tag tag-category">{launch.category}</span><span className="tag tag-neutral">{launch.launchType}</span><span className="sample-label">Synthetic sample</span></div>
      <h3 className="launch-title"><Link to={`/launch/${launch.slug}`}>{launch.title}</Link></h3>
      <div className="launch-card-meta"><Link to={`/brand/${launch.brand.slug}`} className="brand-link">{launch.brand.name}</Link>{launch.founders.map((founder) => <Link to={`/founder/${founder.id}`} className="founder-link" key={founder.id}>{founder.displayName}</Link>)}</div>
      <p className="launch-summary">{launch.summary}</p>
      <div className="card-extras">{launch.location?.city && <span>{launch.location.city}, {launch.location.state}</span>}</div>
      <Link to={`/launch/${launch.slug}`} className="card-read-link">View demo launch <ArrowRight size={15} /></Link>
    </div>
  </article>
}

export function EmptyState({ icon: Icon = Compass, title, description, action }: { icon?: typeof Compass; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} /></span><h2>{title}</h2><p>{description}</p>{action}</div>
}
