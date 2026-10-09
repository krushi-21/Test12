import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const siteUrl = process.env.TEST_PREVIEW_URL ?? 'http://localhost:4173/test'
const parsed = new URL(siteUrl)
const origin = parsed.origin
const previewOrigin = process.env.TEST_PREVIEW_ORIGIN ?? origin
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
  constructor(url, apiOrigin) {
    this.socket = new WebSocket(url)
    this.nextId = 0
    this.pending = new Map()
    this.events = []
    this.apiOrigin = apiOrigin
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
      } else {
        this.events.push(message)
        if (message.method === 'Fetch.requestPaused') {
          const { requestId, request } = message.params
          const headers = Object.entries(request.headers ?? {})
            .filter(([name]) => name.toLowerCase() !== 'origin')
            .map(([name, value]) => ({ name, value }))
          headers.push({ name: 'Origin', value: this.apiOrigin })
          void this.send('Fetch.continueRequest', { requestId, headers }).catch(error => {
            this.events.push({ method: 'Fetch.interceptionError', message: error.message })
          })
        }
      }
    })
  }
  async send(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 12_000)
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.socket.close() }
}

async function waitFor(evaluate, predicate, description, attempts = 100) {
  let last
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await evaluate(predicate)
      if (value) return value
      last = value
    } catch (error) { last = error }
    await delay(150)
  }
  const pageText = await evaluate('document.body?.innerText.slice(0, 1400)').catch(() => '')
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}${pageText ? `\nPage: ${pageText}` : ''}`)
}
async function waitForApiRequest(pathname, expectedQuery = {}, description = pathname) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const matched = client?.events.some(event => {
      if (event.method !== 'Network.requestWillBeSent') return false
      const url = new URL(event.params.request.url)
      return url.pathname === pathname && Object.entries(expectedQuery).every(([key, value]) => url.searchParams.get(key) === value)
    })
    if (matched) return
    await delay(150)
  }
  assert.fail(`Timed out waiting for API request ${description}`)
}

const debugPort = await freePort()
const profile = await mkdtemp(path.join(os.tmpdir(), 'synthetic-preview-ui-'))
const browserLog = []
const browser = spawn(chromium, [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote',
  '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check',
  '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--disable-domain-reliability',
  `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${parsed.hostname}, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
  '--ignore-certificate-errors', '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] })
browser.stderr.on('data', chunk => browserLog.push(chunk.toString()))
let client
async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function click(selector) {
  const clicked = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true })()`)
  assert.equal(clicked, true, `Expected a clickable element: ${selector}`)
}
async function clickButton(text, root = 'body') {
  const clicked = await evaluate(`(() => { const root = document.querySelector(${JSON.stringify(root)}); const button = [...(root?.querySelectorAll('button') ?? [])].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) return false; button.click(); return true })()`)
  assert.equal(clicked, true, `Expected button “${text}” in ${root}`)
}
async function clickButtonContaining(text, root = 'body') {
  const clicked = await evaluate(`(() => { const root = document.querySelector(${JSON.stringify(root)}); const button = [...(root?.querySelectorAll('button') ?? [])].find(item => item.textContent.includes(${JSON.stringify(text)})); if (!button) return false; button.click(); return true })()`)
  assert.equal(clicked, true, `Expected a button containing “${text}” in ${root}`)
}
async function fill(selector, value) {
  const result = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set; setter.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', {bubbles:true})); element.dispatchEvent(new Event('change', {bubbles:true})); return true })()`)
  assert.equal(result, true, `Expected input: ${selector}`)
}

try {
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
    return response.ok ? response.json() : false
  }, Boolean, 'Chromium DevTools')
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
  const target = targets.find(item => item.type === 'page')
  assert.ok(target?.webSocketDebuggerUrl)
  client = new CdpClient(target.webSocketDebuggerUrl, previewOrigin)
  await client.ready
  await client.send('Network.enable')
  await client.send('Network.setExtraHTTPHeaders', { headers: { 'ngrok-skip-browser-warning': 'true' } })
  await client.send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api*`, requestStage: 'Request' }] })
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await client.send('Page.navigate', { url: `${origin}/test` })
  await waitFor(evaluate, 'document.body?.innerText.toLowerCase().includes("aarambh") && document.body.innerText.toLowerCase().includes("trending today") && document.body.innerText.toLowerCase().includes("popular categories") && document.body.innerText.toLowerCase().includes("local guides") && document.body.innerText.toLowerCase().includes("top businesses this month") && document.querySelector(".home-launch-shelf .test-launch-card") && document.querySelectorAll(".test-launch-card").length >= 6', 'API-backed Aarambh homepage')
  await waitForApiRequest('/api/categories/popular', {}, 'popular categories endpoint')
  await waitForApiRequest('/api/businesses/leaderboard', { period: 'monthly' }, 'monthly business leaderboard endpoint')
  await waitForApiRequest('/api/collections/public', {}, 'public collections index')
  assert.equal(await evaluate('document.querySelector("#test-preview-login") === null'), true, 'the interactive app must open without an outer preview login')
  assert.match(await evaluate('document.title'), /Interactive synthetic test preview/u)
  assert.match(await evaluate('document.body.innerText'), /isolated and disposable/iu)
  assert.equal(await evaluate('document.querySelector(".home-location-control select")?.value'), 'Ahmedabad', 'the homepage should default to Ahmedabad')
  assert.equal(await evaluate('document.querySelector(".home-filter-control select")?.getAttribute("aria-label")'), 'Filter by category', 'the homepage should expose a category filter')
  const mobileShell = await evaluate(`(() => {
    const menu = document.querySelector('.test-sidebar-menu')
    const menuSummary = menu?.querySelector('summary')
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect()
    return {
      menuClosed: !menu?.open,
      menuControlVisible: Boolean(menuSummary && getComputedStyle(menuSummary).display !== 'none'),
      savedHref: document.querySelector('[data-testid="saved-businesses-nav"]')?.getAttribute('href'),
      routeTargets: [...document.querySelectorAll('.test-sidebar-nav a[href]')].map(link => link.getAttribute('href')),
      staticPreviewHref: document.querySelector('.test-sidebar-footer .test-static-link')?.getAttribute('href'),
      searchWidth: Math.round(rect('.home-search')?.width ?? 0),
      cityWidth: Math.round(rect('.home-header-city')?.width ?? 0),
      heroHeading: document.querySelector('#home-title')?.textContent.trim(),
      heroHeadingTop: Math.round(rect('#home-title')?.top ?? Infinity),
      duplicateTabs: getComputedStyle(document.querySelector('.home-mobile-tabs')).display
    }
  })()`)
  assert.equal(mobileShell.menuClosed, true, 'mobile navigation should start compact')
  assert.equal(mobileShell.menuControlVisible, true, 'the mobile menu control should be visible')
  assert.equal(mobileShell.savedHref, '/test/saved-businesses', 'the saved-businesses route target must remain exact')
  const formerShellRoutes = ['/test', '/test/account', '/test/workspace', '/test/leaderboard', '/test/nearby', '/test/following', '/test/saved-businesses', '/test/upcoming', '/test/trending', '/test/collections', '/test/dashboard', '/test/notifications', '/test/samples/community', '/test/samples/launch-calendar', '/test/samples/analytics', '/test/samples/trending', '/test/samples/notifications']
  assert.ok(formerShellRoutes.every(route => mobileShell.routeTargets.includes(route)), 'all prior shared-shell route destinations must remain in the sidebar')
  assert.equal(mobileShell.staticPreviewHref, '/', 'the static preview destination must remain available')
  assert.ok(mobileShell.searchWidth > 0 && mobileShell.cityWidth > 0, 'homepage search and city controls should both remain visible on mobile')
  assert.ok(mobileShell.heroHeading.includes('Rooted in craft.') && mobileShell.heroHeading.includes('Made by India.'), 'the reference homepage hero remains present on mobile')
  assert.ok(mobileShell.heroHeadingTop >= 0 && mobileShell.heroHeadingTop < 844, 'the first homepage hero heading should remain in the mobile first viewport')
  assert.equal(mobileShell.duplicateTabs, 'none', 'shared mobile navigation should replace the homepage-only bottom tabs')
  await click('.test-sidebar-menu > summary')
  assert.equal(await evaluate('document.querySelector(".test-sidebar-menu")?.open'), true, 'mobile menu should reveal its route list')
  await click('.test-sidebar-menu > summary')
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await waitFor(evaluate, 'innerWidth === 1440', 'desktop viewport')
  const desktopHome = await evaluate(`(() => {
    const sidebar = document.querySelector('.test-sidebar')
    const menu = document.querySelector('.test-sidebar-menu')
    const nav = document.querySelector('.test-sidebar-nav')
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect()
    return {
      sidebarWidth: Math.round(sidebar?.getBoundingClientRect().width ?? 0),
      menuControlDisplay: getComputedStyle(document.querySelector('.test-sidebar-menu > summary')).display,
      menuOpen: menu?.open,
      navVisible: Boolean(nav?.getClientRects().length),
      searchWidth: Math.round(rect('.home-search')?.width ?? 0),
      cityWidth: Math.round(rect('.home-header-city')?.width ?? 0),
      heroHeading: document.querySelector('#home-title')?.textContent.trim(),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth
    }
  })()`)
  assert.equal(desktopHome.sidebarWidth, 248, 'desktop homepage should use the shared fixed-width sidebar')
  assert.equal(desktopHome.menuControlDisplay, 'none', 'desktop navigation should render as a persistent sidebar')
  assert.equal(desktopHome.menuOpen, true, 'desktop sidebar details should stay open')
  assert.equal(desktopHome.navVisible, true, 'desktop route links should be visible without opening a menu')
  assert.ok(desktopHome.searchWidth > 0 && desktopHome.cityWidth > 0, 'homepage search and city controls should remain visible on desktop')
  assert.ok(desktopHome.heroHeading.includes('Rooted in craft.') && desktopHome.heroHeading.includes('Made by India.'), 'the reference homepage hero should remain intact')
  assert.equal(desktopHome.horizontalOverflow, false, 'the desktop homepage should not overflow horizontally')
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await waitFor(evaluate, 'innerWidth === 390', 'return to mobile viewport')
  assert.equal(await evaluate('document.querySelector(".home-launch-cta")?.getAttribute("href")'), '/test/nearby?city=Ahmedabad', 'Explore makers should open nearby discovery')
  assert.equal(await evaluate('document.querySelector(".home-founder-link")?.getAttribute("href")'), '/test/workspace', 'Launch your business should open the synthetic founder workspace')
  await fill('.home-location-control select', 'Bengaluru')
  await waitForApiRequest('/api/launches', { city: 'Bengaluru' }, 'city-filtered new launches request')
  await waitFor(evaluate, 'document.querySelector(".home-hero-badge")?.innerText.toLowerCase().includes("new in bengaluru")', 'Bengaluru city filter state in hero badge')
  await fill('.home-location-control select', 'Ahmedabad')
  await fill('.home-filter-control select', 'arts-crafts')
  await waitFor(evaluate, 'document.querySelector(".home-launch-shelf")?.innerText.includes("Sample Loomworks collection")', 'category-filtered new launches')
  await fill('.home-filter-control select', '')
  assert.equal(await evaluate('document.documentElement.scrollWidth > window.innerWidth'), false, 'the homepage should fit the 390px mobile viewport without horizontal overflow')
  await fill('#home-unified-search', 'Sample Riverstone Cafe')
  await click('.home-search button[type="submit"]')
  await waitFor(evaluate, 'document.querySelector(".home-search-results")?.innerText.includes("Sample Riverstone Cafe")', 'unified business search')
  await waitFor(evaluate, '!document.querySelector(".home-search button[type=submit]")?.disabled && !document.querySelector(".home-search-results")?.innerText.includes("Searching businesses, launches, and founders")', 'business search complete before founder search')
  await fill('#home-unified-search', 'Rhea Sample')
  await click('.home-search button[type="submit"]')
  await waitFor(evaluate, 'document.querySelector(".home-search-results-heading h2")?.textContent.includes("Rhea Sample")', 'founder search heading')
  await waitFor(evaluate, '!document.querySelector(".home-search button[type=submit]")?.disabled && !document.querySelector(".home-search-results")?.innerText.includes("Searching businesses, launches, and founders")', 'founder search submit to re-enable')
  await waitFor(evaluate, 'document.querySelector(".home-founder-list")?.innerText.includes("Rhea Sample")', 'unified founder search')
  await waitForApiRequest('/api/founders', { query: 'Rhea Sample' }, 'independent founder search')
  await click('.home-founder-list a[href^="/test/founder/"]')
  await waitFor(evaluate, 'Boolean(document.querySelector(".home-founder-page .home-founder-current") && document.querySelector("#founder-launches-heading"))', 'public synthetic founder profile')
  await click('.test-wordmark[href="/test"]')
  await waitFor(evaluate, 'Boolean(document.querySelector("#home-unified-search"))', 'return to Aarambh homepage')
  await waitFor(evaluate, '(() => { const section=document.querySelector(".home-section-guides"); return Boolean(section && (section.querySelector(".home-guide-card") || section.innerText.includes("No public collections are available yet"))) })()', 'public guides or empty state')
  const guideState = await evaluate(`(async () => { const response=await fetch('/api/collections/public?limit=6'); const payload=await response.json(); const expected=payload.items.filter(item=>item.shareUrl).slice(0,6).map(item=>item.shareUrl); const section=document.querySelector('.home-section-guides'); const actual=[...section.querySelectorAll('.home-guide-card')].map(card=>card.getAttribute('href')); return { expected, actual, emptyCopy: section.innerText.includes('No public collections are available yet.') } })()`)
  assert.deepEqual(guideState.actual, guideState.expected, 'homepage local guides should mirror only API-backed public collections')
  assert.equal(guideState.emptyCopy, guideState.expected.length === 0, 'the empty guides message should appear only when the API has no shareable collections')
  await waitFor(evaluate, `Boolean(document.querySelector('a[href^="/test/launch/sample-release-notes"]'))`, 'sample launch feed after local guide')
  await click('a[href^="/test/launch/sample-release-notes"]')
  await waitFor(evaluate, 'document.querySelector(".test-detail-copy h1")?.textContent.includes("release notes")', 'synthetic launch detail')
  await click('.test-nav a[href="/test/account"]')
  await waitFor(evaluate, 'document.body.innerText.includes("SEEDED SYNTHETIC ACCOUNTS")', 'account page')
  await clickButtonContaining('Member account', '.test-seed-accounts')
  await click('.test-form-card button[type="submit"]')
  await waitFor(evaluate, 'document.querySelector(".test-sidebar-account")?.textContent.includes("Milan Sample")', 'member account session')
  await click('.test-nav a[href="/test"]')
  await waitFor(evaluate, 'document.querySelectorAll(".test-launch-card").length >= 6', 'member Aarambh homepage')
  await click('a[href^="/test/launch/sample-release-notes"]')
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-engagement-panel"))', 'member launch actions')
  const likeLabel = await evaluate('[...document.querySelectorAll(".test-engagement-panel button")].find(button => /^(Like|Unlike)$/u.test(button.textContent.trim()))?.textContent.trim()')
  assert.ok(likeLabel === 'Like' || likeLabel === 'Unlike')
  await clickButton(likeLabel, '.test-engagement-panel')
  await waitFor(evaluate, `document.querySelector(".test-engagement-panel")?.innerText.includes(${JSON.stringify(likeLabel === 'Like' ? 'Unlike' : 'Like')})`, 'like action')
  const saveLabel = await evaluate('[...document.querySelectorAll(".test-engagement-panel button")].find(button => /^(Save launch|Remove save)$/u.test(button.textContent.trim()))?.textContent.trim()')
  assert.ok(saveLabel === 'Save launch' || saveLabel === 'Remove save')
  await clickButton(saveLabel, '.test-engagement-panel')
  await waitFor(evaluate, `document.querySelector(".test-engagement-panel")?.innerText.includes(${JSON.stringify(saveLabel === 'Save launch' ? 'Remove save' : 'Save launch')})`, 'save action')
  await clickButton('Record share', '.test-engagement-panel')
  await waitFor(evaluate, 'document.querySelector(".test-engagement-panel")?.innerText.includes("Share event recorded locally")', 'share action')

  await click('a[href="/test/account"]')
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-session-card"))', 'signed-in account controls')
  await clickButton('Sign out', '.test-session-card')
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-form-card"))', 'member sign out')
  await clickButtonContaining('Founder account', '.test-seed-accounts')
  await click('.test-form-card button[type="submit"]')
  await waitFor(evaluate, 'document.querySelector(".test-sidebar-account")?.textContent.includes("Rhea Sample")', 'founder account session')
  await click('a[href="/test/workspace"]')
  await waitFor(evaluate, 'document.querySelector("#test-workspace-welcome-title")?.textContent.trim() === "Welcome back, Rhea Sample" && document.body.innerText.includes("Sample Orbit Labs")', 'founder workspace welcome dashboard')
  const stamp = Date.now()
  const brandName = `Browser Synthetic Brand ${stamp}`
  await fill('.test-workspace-page input', brandName)
  await clickButton('Attach built-in synthetic logo', '.test-workspace-card:nth-of-type(2)')
  await waitFor(evaluate, 'document.body.innerText.includes("sample brand image uploaded")', 'brand image upload')
  await clickButton('Create draft brand', '.test-workspace-card:nth-of-type(2)')
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(brandName)})`, 'brand draft creation')
  const brandRow = `.test-owned-row` // choose the row by content for the publish action
  const brandPublished = await evaluate(`(() => { const row=[...document.querySelectorAll(${JSON.stringify(brandRow)})].find(item=>item.innerText.includes(${JSON.stringify(brandName)})); const button=[...(row?.querySelectorAll('button')??[])].find(item=>item.textContent.trim()==='Publish synthetic brand'); if(!button)return false;button.click();return true })()`)
  assert.equal(brandPublished, true, 'new synthetic brand should expose a publish action')
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(`${brandName}\npublished`)}) || document.body.innerText.includes("Synthetic brand")`, 'brand publish')
  const launchTitle = `Browser Synthetic Launch ${stamp}`
  await fill('.test-workspace-card:nth-of-type(3) input', launchTitle)
  await clickButton('Attach built-in synthetic launch image', '.test-workspace-card:nth-of-type(3)')
  await waitFor(evaluate, 'document.body.innerText.includes("sample launch image uploaded")', 'launch image upload')
  await clickButton('Create launch draft', '.test-workspace-card:nth-of-type(3)')
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(launchTitle)})`, 'launch draft creation')
  const launchPublished = await evaluate(`(() => { const row=[...document.querySelectorAll('.test-owned-row')].find(item=>item.innerText.includes(${JSON.stringify(launchTitle)})); const button=[...(row?.querySelectorAll('button')??[])].find(item=>item.textContent.trim()==='Publish synthetic launch'); if(!button)return false;button.click();return true })()`)
  assert.equal(launchPublished, true, 'new launch draft should expose a publish action')
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(`${launchTitle}\npublished`)}) || document.body.innerText.includes("Synthetic launch")`, 'launch publish')
  await click('a[href="/test"]')
  await waitFor(evaluate, 'Boolean(document.querySelector("#home-unified-search"))', 'Aarambh search after launch publish')
  await fill('#home-unified-search', launchTitle)
  await click('.home-search button[type="submit"]')
  await waitFor(evaluate, `document.querySelector(".home-search-launches")?.innerText.includes(${JSON.stringify(launchTitle)}) && document.querySelectorAll('.home-search-launches .test-launch-card').length === 1`, 'new launch becoming visible through unified search')

  await click('.test-nav a[href="/test/workspace"]')
  await waitFor(evaluate, 'document.querySelector(".test-product-manager select")?.querySelectorAll("option").length >= 2', 'product manager brand choices')
  const createdBrandId = await evaluate(`(() => [...document.querySelector('.test-product-manager select').options].find(option => option.textContent.includes(${JSON.stringify(brandName)}))?.value ?? '')()`)
  assert.ok(createdBrandId, 'the newly published brand should be available for product management')
  await fill('.test-product-manager select', createdBrandId)
  await waitFor(evaluate, `document.querySelector('.test-product-manager select')?.value === ${JSON.stringify(createdBrandId)}`, 'product brand selection')
  let productName = `Browser Synthetic Product ${stamp}`
  await fill('.test-product-form input[placeholder="Fictional sample product"]', productName)
  await fill('.test-product-form textarea', 'A fictional product added by the isolated browser smoke test.')
  await fill('.test-product-form input[type="url"]', 'https://browser-synthetic-brand.invalid/products/sample')
  await clickButton('Add product', '.test-product-manager')
  await waitFor(evaluate, `document.querySelector(".test-product-manager")?.innerText.includes(${JSON.stringify(productName)})`, 'owner product creation')
  await clickButton('Edit', '.test-product-owner-row')
  productName = `${productName} Edited`
  await fill('.test-product-form input[placeholder="Fictional sample product"]', productName)
  await fill('.test-product-form textarea', 'An edited fictional catalog product saved through the owner API.')
  await clickButton('Save product changes', '.test-product-manager')
  await waitFor(evaluate, `document.querySelector(".test-product-manager")?.innerText.includes(${JSON.stringify(productName)})`, 'owner product edit')
  await client.send('Page.navigate', { url: `${origin}/test/business-profile` })
  await waitFor(evaluate, 'document.querySelectorAll(".test-hours-row").length === 7', 'weekday opening-hours editor')
  await fill('select[aria-label="Monday opening status"]', 'open')
  await fill('input[aria-label="Monday opens"]', '10:00')
  await fill('input[aria-label="Monday closes"]', '18:00')
  await clickButton('Save profile', '.test-profile-form')
  await waitFor(evaluate, 'document.body.innerText.includes("Business profile and weekly hours saved")', 'weekly-hours save')
  await client.send('Page.navigate', { url: `${origin}/test/business-profile` })
  await waitFor(evaluate, `document.querySelector('select[aria-label="Monday opening status"]')?.value === 'open' && document.querySelector('input[aria-label="Monday opens"]')?.value === '10:00'`, 'weekly-hours persistence')
  await client.send('Page.navigate', { url: `${origin}/test/workspace` })
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-product-manager"))', 'return to product manager')
  await fill('.test-product-manager select', createdBrandId)
  await waitFor(evaluate, `document.querySelector('.test-product-manager select')?.value === ${JSON.stringify(createdBrandId)}`, 'product brand reselect')
  await click('.test-product-manager a[href^="/test/brand/"]')
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(productName)}) && document.querySelectorAll('.test-product-card').length === 1`, 'public brand product card')
  const productLink = await evaluate('(() => { const link=document.querySelector(".test-product-buy"); return link ? {href:link.href,target:link.target,rel:link.rel,referrerPolicy:link.referrerPolicy,label:link.textContent.trim()} : null })()')
  assert.ok(productLink)
  assert.equal(productLink.href, 'https://browser-synthetic-brand.invalid/products/sample')
  assert.equal(productLink.target, '_blank')
  assert.match(productLink.rel, /noopener/u)
  assert.match(productLink.rel, /noreferrer/u)
  assert.equal(productLink.label, 'View on business site ↗')
  assert.match(await evaluate('document.querySelector(".test-product-card")?.innerText ?? ""'), /Demo link · reserved \.invalid address/u)
  assert.equal(await evaluate('document.querySelector(".test-product-card .test-product-price") === null'), true, 'product price can be omitted')

  await click('.test-nav a[href="/test/account"]')
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-session-card"))', 'return to signed-in account')
  await clickButton('Sign out', '.test-session-card')
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-form-card"))', 'founder sign out')
  await clickButton('Register synthetic account', '.test-form-card')
  const fakeEmail = `browser-${stamp}@synthetic.example.invalid`
  await fill('.test-form-card input:not([type])', 'Browser Synthetic User')
  await fill('.test-form-card input[type="email"]', fakeEmail)
  await fill('.test-form-card input[type="password"]', 'Browser_Synthetic_Pass_2026!')
  await clickButton('Create synthetic account', '.test-form-card')
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(fakeEmail)}) && document.body.innerText.includes("Consume local verification link")`, 'local verification message')
  await clickButton('Consume local verification link', '.test-outbox')
  await waitFor(evaluate, 'document.querySelector(".test-sidebar-account")?.textContent.includes("Browser Synthetic User")', 'verified synthetic account session')

  await client.send('Page.navigate', { url: `${origin}/test/nearby` })
  await waitFor(evaluate, 'document.querySelectorAll(".test-business-card").length >= 2 && document.body.innerText.includes("Explore makers near you")', 'nearby maker directory')
  const searchedBusiness = await evaluate('document.querySelector(".test-business-card h2")?.innerText.trim() ?? ""')
  assert.ok(searchedBusiness)
  await fill('.test-discovery-filters input[placeholder^="Cafe, studio"]', searchedBusiness)
  await waitFor(evaluate, `document.querySelectorAll(".test-business-card").length === 1 && document.querySelector(".test-business-card h2")?.innerText.includes(${JSON.stringify(searchedBusiness)})`, 'nearby business search filter')
  await fill('.test-discovery-filters input[placeholder^="Cafe, studio"]', '')
  await fill('.test-discovery-filters input[placeholder="e.g. Navrangpura"]', 'Navrangpura')
  await waitFor(evaluate, '(() => { const names = [...document.querySelectorAll(".test-business-card h2")].map(item => item.innerText.trim()); return names.length >= 2 && names.includes("Sample Riverstone Cafe") && names.includes("Miti Studio") })()', 'Navrangpura filter returns both known seeded businesses')
  const navrangpuraMatches = await evaluate('[...document.querySelectorAll(".test-business-card h2")].map(item => item.innerText.trim())')
  assert.ok(navrangpuraMatches.length >= 2, 'the area filter should retain all valid matches')
  assert.ok(navrangpuraMatches.includes('Sample Riverstone Cafe'), 'Sample Riverstone Cafe should match Navrangpura')
  assert.ok(navrangpuraMatches.includes('Miti Studio'), 'Miti Studio should match Navrangpura')
  await waitForApiRequest('/api/discover/businesses', { city: 'Ahmedabad', area: 'Navrangpura' }, 'city and area filters')
  await click('.test-filter-toggles input[aria-label="Open now"]')
  await waitForApiRequest('/api/discover/businesses', { openNow: 'true' }, 'open-now filter parameter')
  await waitFor(evaluate, '[...document.querySelectorAll(".test-business-card .test-status-chip")].length > 0 && [...document.querySelectorAll(".test-business-card .test-status-chip")].every(item => item.innerText.toLowerCase().includes("open now"))', 'open-now filter in India time')
  assert.match(await evaluate('document.querySelector(".test-business-location")?.innerText ?? ""'), /km away/u, 'city-centre radius results should show distance without requesting device location')
  await fill('.test-filter-toggles select[aria-label="Search radius in kilometres"]', '10')
  await waitForApiRequest('/api/discover/businesses', { radiusKm: '10' }, '10 km discovery radius')
  await fill('.test-filter-toggles select[aria-label="Search radius in kilometres"]', '25')
  await waitForApiRequest('/api/discover/businesses', { radiusKm: '25' }, 'restored 25 km discovery radius')
  await click('.test-filter-toggles input[aria-label="Open now"]')
  await fill('.test-discovery-filters input[placeholder="e.g. Navrangpura"]', '')
  await fill('.test-discovery-filters select[aria-label="Filter by category"]', 'arts-crafts')
  await waitForApiRequest('/api/discover/businesses', { category: 'arts-crafts' }, 'category filter')
  await waitFor(evaluate, 'document.querySelectorAll(".test-business-card").length >= 1 && [...document.querySelectorAll(".test-business-card")].some(card => card.innerText.includes("Sample Loomworks Studio"))', 'category-filtered business results')
  await fill('.test-discovery-filters select[aria-label="Filter by category"]', '')
  await fill('.test-discovery-filters select[aria-label="Filter by business type"]', 'physical')
  await waitForApiRequest('/api/discover/businesses', { mode: 'physical' }, 'physical business mode')
  await fill('.test-discovery-filters select[aria-label="Filter by business type"]', 'online')
  await fill('.test-discovery-filters input[aria-label="Filter by city"]', 'Bengaluru')
  await waitForApiRequest('/api/discover/businesses', { mode: 'online', city: 'Bengaluru' }, 'online business mode and city')
  await waitFor(evaluate, 'document.querySelectorAll(".test-business-card").length === 1 && document.querySelector(".test-business-card h2")?.innerText.includes("Sample Byte Tools")', 'online business results')
  await fill('.test-discovery-filters input[aria-label="Filter by city"]', 'Ahmedabad')
  await fill('.test-discovery-filters select[aria-label="Filter by business type"]', '')
  await fill('.test-discovery-filters select[aria-label="Sort businesses"]', 'trending')
  await waitForApiRequest('/api/discover/businesses', { sort: 'trending' }, 'trending sort')
  await fill('.test-discovery-filters select[aria-label="Sort businesses"]', 'most_saved')
  await waitForApiRequest('/api/discover/businesses', { sort: 'most_saved' }, 'most-saved sort')
  await fill('.test-discovery-filters select[aria-label="Sort businesses"]', 'most_liked')
  await waitForApiRequest('/api/discover/businesses', { sort: 'most_liked' }, 'most-liked sort')
  await fill('.test-discovery-filters select[aria-label="Sort businesses"]', 'new')
  await fill('.test-discovery-filters input[aria-label="Minimum price in rupees"]', '1299')
  await fill('.test-discovery-filters input[aria-label="Maximum price in rupees"]', '2000')
  await waitForApiRequest('/api/discover/businesses', { priceMin: '129900', priceMax: '200000' }, 'INR price range converted to paise')
  await click('.test-filter-toggles input[aria-label="Has a launch in the last 30 days"]')
  await waitForApiRequest('/api/discover/businesses', { newlyLaunched: 'true' }, 'recent launch filter')
  await click('.test-filter-toggles input[aria-label="Email-verified founder account"]')
  await waitForApiRequest('/api/discover/businesses', { verified: 'true' }, 'verified founder filter')
  await fill('.test-discovery-filters select[aria-label="Sort businesses"]', 'nearby')
  await fill('.test-discovery-filters input[aria-label="Minimum price in rupees"]', '')
  await fill('.test-discovery-filters input[aria-label="Maximum price in rupees"]', '')
  await click('.test-filter-toggles input[aria-label="Has a launch in the last 30 days"]')
  await click('.test-filter-toggles input[aria-label="Email-verified founder account"]')
  await waitFor(evaluate, '[...document.querySelectorAll(".test-business-card")].some(card => card.innerText.includes("Sample Riverstone Cafe"))', 'reset nearby filters before business actions')
  const contactLinks = await evaluate(`(() => { const card=[...document.querySelectorAll('.test-business-card')].find(item=>item.innerText.includes('Sample Riverstone Cafe')); return [...(card?.querySelectorAll('.test-contact-actions a')??[])].map(link=>({label:link.textContent.trim(),href:link.href,rel:link.rel,referrerPolicy:link.referrerPolicy})) })()`)
  assert.ok(contactLinks.some(link => link.label.startsWith('Directions') && link.href.startsWith('https://www.google.com/maps/')))
  assert.ok(contactLinks.some(link => link.label.startsWith('Request a quote') && link.href.startsWith('https://')))
  assert.ok(contactLinks.some(link => link.label.startsWith('Call') && link.href.startsWith('tel:')))
  const openedContactLinks = await evaluate(`(() => { const card=[...document.querySelectorAll('.test-business-card')].find(item=>item.innerText.includes('Sample Riverstone Cafe')); const links=[...(card?.querySelectorAll('.test-contact-actions a')??[])]; for(const link of links){link.addEventListener('click',event=>event.preventDefault(),{capture:true,once:true});link.click()} return links.length })()`)
  assert.ok(openedContactLinks >= 5, 'the sample business should expose multiple contact and action links')
  await delay(900)
  const contactRequests = client.events.filter(event => event.method === 'Network.requestWillBeSent' && /\/api\/businesses\/[^/]+\/events$/u.test(new URL(event.params.request.url).pathname))
  const acceptedContactRequestIds = new Set(client.events.filter(event => event.method === 'Network.responseReceived' && event.params.response.status === 202).map(event => event.params.requestId))
  assert.ok(contactRequests.length >= 5 && contactRequests.every(event => acceptedContactRequestIds.has(event.params.requestId)), 'contact, directions, and quote/demo/store events should be accepted without opening their external destinations')
  await clickButton('Follow business', '.test-business-card')
  await waitFor(evaluate, 'document.querySelector(".test-business-card .test-follow-control")?.innerText.includes("Following")', 'business follow action')
  await client.send('Page.navigate', { url: `${origin}/test/following` })
  await waitFor(evaluate, 'document.querySelectorAll(".test-feature-launch-card").length >= 1', 'personalized Following feed')

  await client.send('Page.navigate', { url: `${origin}/test/collections` })
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-collection-form"))', 'collection authoring form')
  const collectionName = `Browser Favorites ${stamp}`
  await fill('.test-collection-form input', collectionName)
  await fill('.test-collection-form textarea', 'A synthetic shareable launch list for the browser smoke.')
  await click('.test-collection-form input[type="checkbox"]')
  await clickButton('Create collection', '.test-collection-form')
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(collectionName)}) && Boolean(document.querySelector('.test-collection-card a[href^="/test/collection/"]'))`, 'public collection creation')
  const sharePath = await evaluate(`document.querySelector('.test-collection-card a[href^="/test/collection/"]')?.getAttribute('href')`)
  assert.ok(sharePath)
  await client.send('Page.navigate', { url: `${origin}/test/launch/sample-release-notes` })
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-add-collection select"))', 'add-to-collection selector')
  await clickButton('Add to list', '.test-add-collection')
  await waitFor(evaluate, 'document.querySelector(".test-add-collection")?.innerText.includes("Added to collection")', 'launch added to collection')
  await client.send('Page.navigate', { url: `${origin}${sharePath}` })
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(collectionName)}) && document.body.innerText.includes("A calmer way to share release notes")`, 'shareable public collection view')
  await client.send('Page.navigate', { url: `${origin}/test` })
  await waitFor(evaluate, `document.querySelector(".home-guide-card")?.innerText.includes(${JSON.stringify(collectionName)})`, 'Local Guides loads a real public collection')
  assert.equal(await evaluate('document.querySelector(".home-guide-card")?.getAttribute("href")'), sharePath, 'Local Guide card should link to the public collection share page')
  await click('.home-guide-card')
  await waitFor(evaluate, `document.body.innerText.includes(${JSON.stringify(collectionName)}) && document.body.innerText.includes("A calmer way to share release notes")`, 'Local Guide collection destination')

  await client.send('Page.navigate', { url: `${origin}/test/brand/sample-orbit-labs` })
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-review-form")) && document.body.innerText.includes("Sample Orbit Labs")', 'business contact and structured review page')
  await clickButton('Submit structured review', '.test-review-form')
  await waitFor(evaluate, 'document.body.innerText.includes("Your structured review is published")', 'verified member review submission')
  await client.send('Page.navigate', { url: `${origin}/test/upcoming` })
  await waitFor(evaluate, 'document.body.innerText.includes("Upcoming launches") && document.body.innerText.includes("Sample upcoming launch")', 'scheduled launch calendar')
  await click('a[href^="/test/launch/sample-coming-soon"]')
  await waitFor(evaluate, 'Boolean(document.querySelector(".test-lifecycle-panel")) && document.querySelector(".test-lifecycle-panel")?.innerText.includes("Notify me when launched")', 'scheduled launch reminder control')
  await clickButton('Notify me when launched', '.test-lifecycle-panel')
  await waitFor(evaluate, 'document.querySelector(".test-lifecycle-panel")?.innerText.includes("Launch reminder set.")', 'launch reminder creation')
  await clickButton('Remove reminder', '.test-lifecycle-panel')
  await waitFor(evaluate, 'document.querySelector(".test-lifecycle-panel")?.innerText.includes("Launch reminder removed.")', 'launch reminder removal')
  await client.send('Page.navigate', { url: `${origin}/test/trending` })
  await waitFor(evaluate, 'document.body.innerText.includes("Trending") && document.body.innerText.includes("Trending today")', 'trending dashboard')
  await client.send('Page.navigate', { url: `${origin}/test/dashboard` })
  await waitFor(evaluate, 'document.body.innerText.includes("Good ") && document.body.innerText.includes("Business performance")', 'founder dashboard surface')
  await client.send('Page.navigate', { url: `${origin}/test/notifications` })
  await waitFor(evaluate, 'document.body.innerText.includes("Notifications") && document.body.innerText.includes("unread")', 'in-app notification center')

  const requests = client.events.filter(event => event.method === 'Network.requestWillBeSent').map(event => event.params.request.url).filter(url => /^https?:/iu.test(url))
  assert.ok(requests.length > 0)
  const allowedOrigins = [...new Set([origin, previewOrigin])]
  assert.ok(requests.every(url => allowedOrigins.includes(new URL(url).origin)), `Browser HTTP traffic must stay within the preview origins: ${requests.filter(url => !allowedOrigins.includes(new URL(url).origin)).join(', ')}`)
  const errors = client.events.filter(event => event.method === 'Runtime.exceptionThrown')
  assert.equal(errors.length, 0, 'the interactive React UI should not throw browser exceptions')
  console.log(`PASS: interactive React homepage/search/detail, seeded account login/logout, like/save/share, and preview-origin-only requests (${requests.length} HTTP requests).`)
  console.log('PASS: founder workspace, built-in local image uploads, brand draft/publish, launch draft/publish, and API-backed unified search visibility.')
  console.log('PASS: owner-only database-backed product create/edit, optional price, direct HTTPS business link, and weekly-hours persistence.')
  console.log('PASS: synthetic account registration and in-page local verification without SMTP or external destinations.')
  console.log('PASS: nearby city/area/category/price/recency/trending/saved/liked/verified/mode/open-now/radius filters, verified business follow, and contact/directions/quote/demo/store links with recorded events.')
  console.log('PASS: public collections index powers Local Guides; structured ratings, upcoming launches, trending, analytics, and notification routes.')
} finally {
  client?.close()
  browser.kill('SIGTERM')
  await new Promise(resolve => {
    if (browser.exitCode !== null) return resolve()
    browser.once('exit', resolve)
    setTimeout(resolve, 2000).unref()
  })
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
  if (browserLog.length) {
    const combined = browserLog.join('')
    if (/ERROR:|FATAL:/u.test(combined)) console.error(combined)
  }
}
