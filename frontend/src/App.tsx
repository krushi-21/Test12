import { useEffect } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { BrandPage, ExplorePage, FounderPage, HowItWorksPage, LaunchDetailPage, LeaderboardPage } from './pages-public'
import { AppShell } from './ui'
import { InteractiveTestMode } from './test-mode'
import './test-integration.css'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }) }, [pathname])
  return null
}

function NotFoundPage() {
  return <AppShell><div className="content-width not-found-page">
    <span className="eyebrow">NOT AVAILABLE IN THIS DEMO</span>
    <h1>This page isn’t part of the preview.</h1>
    <p>Only synthetic public discovery pages are enabled. Account, founder-workspace, and write features are off.</p>
    <Link to="/" className="button button-primary">Explore launches</Link>
  </div></AppShell>
}

function RouteTree() {
  return <><ScrollToTop /><Routes>
    <Route path="/" element={<ExplorePage />} />
    <Route path="/leaderboard" element={<LeaderboardPage />} />
    <Route path="/how-it-works" element={<HowItWorksPage />} />
    <Route path="/launch/:slug" element={<LaunchDetailPage />} />
    <Route path="/brand/:slug" element={<BrandPage />} />
    <Route path="/founder/:id" element={<FounderPage />} />
    <Route path="/test/*" element={<InteractiveTestMode />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes></>
}

export default function App() {
  return <BrowserRouter><RouteTree /></BrowserRouter>
}
