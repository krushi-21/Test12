import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const siteUrl = process.env.SHARED_SHELL_TEST_URL ?? 'http://127.0.0.1:5180/test'
const parsed = new URL(siteUrl)
const chromium = process.env.CHROMIUM_PATH || 'chromium'

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
  const port = server.address().port
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 0
    this.pending = new Map()
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }
  async send(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 10_000)
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value) },
        reject: error => { clearTimeout(timer); reject(error) },
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.socket.close() }
}

const debugPort = await freePort()
const profile = await mkdtemp(path.join(os.tmpdir(), 'aarambh-shell-nav-'))
const browser = spawn(chromium, [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' })
let client

async function waitFor(test, description, timeoutMs = 15_000) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await test()
      if (result) return result
    } catch (error) { lastError = error }
    await delay(120)
  }
  throw new Error(`Timed out waiting for ${description}${lastError instanceof Error ? `: ${lastError.message}` : ''}`)
}

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

try {
  const targets = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
    return response.ok ? response.json() : false
  }, 'Chromium DevTools')
  const page = targets.find(target => target.type === 'page')
  assert.ok(page?.webSocketDebuggerUrl, 'Chromium should expose a page target')
  client = new CdpClient(page.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')

  async function setViewport(width, height, mobile) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  }
  async function navigate(path) {
    const url = new URL(path, parsed.origin).href
    await client.send('Page.navigate', { url })
    await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(new URL(url).pathname)} && Boolean(document.querySelector('.test-sidebar'))`), `shell route ${path}`)
    await delay(100)
  }
  async function inspect() {
    return evaluate(`(() => {
      const bottomNav = document.querySelector('.test-mobile-nav')
      const footer = document.querySelector('.test-footer')
      const notifications = document.querySelector('.test-mobile-notifications')
      const localTabs = document.querySelector('.home-mobile-tabs')
      const navRect = bottomNav?.getBoundingClientRect()
      const footerRect = footer?.getBoundingClientRect()
      const sidebar = document.querySelector('.test-sidebar')
      const sidebarNav = document.querySelector('.test-sidebar-nav')
      return {
        pathname: location.pathname,
        hash: location.hash,
        bottomNavDisplay: bottomNav ? getComputedStyle(bottomNav).display : 'missing',
        bottomNavHeight: navRect ? Math.round(navRect.height) : 0,
        bottomNavTop: navRect ? Math.round(navRect.top) : null,
        tabLabels: [...(bottomNav?.querySelectorAll('a') ?? [])].map(link => link.textContent.trim()),
        activeTabs: [...(bottomNav?.querySelectorAll('a[aria-current="page"]') ?? [])].map(link => link.textContent.trim()),
        activeSidebar: [...document.querySelectorAll('.test-sidebar-nav .test-nav-link[aria-current="page"]')].map(link => link.textContent.trim()),
        notificationsDisplay: notifications ? getComputedStyle(notifications).display : 'missing',
        notificationsCurrent: notifications?.getAttribute('aria-current') ?? null,
        localTabsDisplay: localTabs ? getComputedStyle(localTabs).display : 'not-on-this-route',
        contentBottomPadding: parseFloat(getComputedStyle(document.querySelector('.test-shell-content')).paddingBottom),
        footerBottom: footerRect ? Math.round(footerRect.bottom) : null,
        scrollY: Math.round(window.scrollY),
        maximumScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
        sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
        sidebarMenuOpen: document.querySelector('.test-sidebar-menu')?.open,
        sidebarNavVisible: Boolean(sidebarNav?.getClientRects().length),
      }
    })()`)
  }

  await setViewport(390, 844, true)
  const mobileCases = [
    { path: '/test', tab: 'Home', sidebar: ['Discover'] },
    { path: '/test#home-unified-search', tab: 'Home', sidebar: ['Search'] },
    { path: '/test/nearby?city=Ahmedabad', tab: 'Explore', sidebar: ['Ahmedabad'] },
    { path: '/test/nearby', tab: 'Explore', sidebar: ['Explore near you'] },
    { path: '/test/saved-businesses', tab: 'Saved', sidebar: ['Saved & collections'] },
    { path: '/test/collections', tab: 'Saved', sidebar: ['Collections'] },
    { path: '/test/collection/sample-share-token', tab: 'Saved', sidebar: [] },
    { path: '/test/workspace', tab: 'Profile', sidebar: ['Create a launch'] },
    { path: '/test/brand/sample-orbit-labs', tab: 'Profile', sidebar: ['Business profile'] },
    { path: '/test/founder-profile', tab: 'Profile', sidebar: ['My profile'] },
    { path: '/test/launch/sample-release-notes', tab: 'Explore', sidebar: ['Launch detail'] },
    { path: '/test/following', tab: 'Explore', sidebar: ['Following'] },
    { path: '/test/upcoming', tab: 'Explore', sidebar: ['Upcoming'] },
    { path: '/test/trending', tab: 'Explore', sidebar: ['Trending'] },
    { path: '/test/leaderboard', tab: 'Explore', sidebar: ['Leaderboard'] },
    { path: '/test/notifications', tab: null, sidebar: ['Notifications'], notificationsCurrent: true },
  ]

  for (const testCase of mobileCases) {
    await navigate(testCase.path)
    const state = await inspect()
    assert.equal(state.bottomNavDisplay, 'grid', `${testCase.path}: shared mobile tab bar should be visible`)
    assert.deepEqual(state.tabLabels, ['Home', 'Explore', 'Saved', 'Profile'], `${testCase.path}: tab order and labels should match the owner reference`)
    assert.deepEqual(state.activeTabs, testCase.tab ? [testCase.tab] : [], `${testCase.path}: only the correct route-family tab should be current`)
    assert.deepEqual(state.activeSidebar, testCase.sidebar, `${testCase.path}: exactly the target-aware sidebar link(s) should be current`)
    assert.notEqual(state.notificationsDisplay, 'none', `${testCase.path}: mobile notifications action should be visible`)
    assert.equal(state.notificationsCurrent, testCase.notificationsCurrent ? 'page' : null, `${testCase.path}: notifications action should accurately identify its page`)
    assert.equal(state.contentBottomPadding >= 62, true, `${testCase.path}: content should reserve mobile-bar clearance`)
    assert.equal(state.noHorizontalOverflow, true, `${testCase.path}: 390px layout should not overflow horizontally`)
    assert.equal(state.bottomNavTop >= 0 && state.bottomNavTop < 844, true, `${testCase.path}: fixed mobile bar should remain in the viewport`)
    await evaluate('document.documentElement.style.scrollBehavior = "auto"')
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await evaluate('window.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "instant" })')
      await delay(100)
      const scrollState = await evaluate('({ y: window.scrollY, max: Math.max(0, document.documentElement.scrollHeight - innerHeight) })')
      if (scrollState.y >= scrollState.max - 1) break
    }
    const atBottom = await inspect()
    assert.equal(atBottom.footerBottom <= atBottom.bottomNavTop + 1, true, `${testCase.path}: footer should not be obscured at the bottom of the page (footer=${atBottom.footerBottom}, nav=${atBottom.bottomNavTop}, scroll=${atBottom.scrollY}/${atBottom.maximumScroll})`)
  }

  await navigate('/test/account')
  const account = await inspect()
  assert.equal(account.bottomNavDisplay, 'missing', 'account/sign-in route should not render the shared mobile tabs')
  assert.deepEqual(account.activeSidebar, ['Log in / sign up'], 'the shared /test/account target must not mark both account aliases current')
  assert.notEqual(account.notificationsDisplay, 'none', 'notification action should remain available in the mobile shell header')
  assert.equal(account.noHorizontalOverflow, true, 'account route should fit the 390px viewport')

  await navigate('/test')
  const homepage = await inspect()
  assert.equal(homepage.localTabsDisplay, 'none', 'homepage-local tabs must stay hidden when the shared bar replaces them')

  await setViewport(1440, 900, false)
  await navigate('/test/nearby')
  const desktop = await inspect()
  assert.equal(desktop.bottomNavDisplay, 'none', 'the mobile bar should be hidden on desktop')
  assert.equal(desktop.sidebarWidth, 248, 'desktop shell should retain the reference-width navy rail')
  assert.equal(desktop.sidebarMenuOpen, true, 'desktop sidebar navigation should remain persistently open')
  assert.equal(desktop.sidebarNavVisible, true, 'desktop routes should remain visible without a menu toggle')
  assert.equal(desktop.noHorizontalOverflow, true, 'desktop shell should not overflow horizontally')

  console.log(`Shared shell navigation smoke passed: ${mobileCases.length} mobile routes, account alias, homepage tab replacement, and desktop rail.`)
} finally {
  client?.close()
  const browserExited = new Promise(resolve => browser.once('exit', resolve))
  browser.kill('SIGTERM')
  await Promise.race([browserExited, delay(5_000)])
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 })
}
