import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { runWorkerRouteTests } from './worker-routes.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const baseUrl = 'http://127.0.0.1:4317'
const screenshotPath = path.join(root, 'mobile-first-viewport.png')
const detailScreenshotPath = path.join(root, 'launch-detail-mobile.png')
const leaderboardScreenshotPath = path.join(root, 'leaderboard-mobile.png')
const brandScreenshotPath = path.join(root, 'brand-profile-mobile.png')
const founderScreenshotPath = path.join(root, 'founder-profile-mobile.png')
const chromium = process.env.CHROMIUM_PATH || 'chromium'
const previewCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const forbiddenPaths = [
  '/signin', '/signup', '/forgot-password', '/verify-email', '/reset-password',
  '/saved', '/my-brands', '/profile', '/brands/new', '/launches/new', '/analytics',
]
let serverLog = ''
let browserLog = ''

async function getFreePort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()))
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitFor(check, message, attempts = 80) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) { lastError = error }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`${message}${lastError ? `: ${lastError}` : ''}`)
}

function auditSource() {
  const sourceDir = path.join(root, 'src')
  const sourceFiles = ['App.tsx', 'pages-public.tsx', 'ui.tsx', 'types.ts', 'demo.ts']
  const content = sourceFiles.map((file) => readFileSync(path.join(sourceDir, file), 'utf8')).join('\n')
  assert.doesNotMatch(content, /type\s*=\s*['"](?:email|password|tel|url)['"]/i, 'source must not contain personal-data input types')
  assert.doesNotMatch(content, /autoComplete\s*=\s*['"](?:name|email|current-password|new-password)['"]/i, 'source must not request account autofill data')
  assert.doesNotMatch(content, /\b(?:register|login|logout|forgotPassword|resetPassword|verifyEmail|resendVerification|recordShare|outboundUrl|report|toggleLike|toggleSave|publish)\s*\(/i, 'source must not expose account, event, report, or publishing handlers')
  assert.doesNotMatch(content, /https?:\/\//i, 'local demo source must not link to external destinations')
  assert.doesNotMatch(content, /\/api\/(?:me|auth|reports|uploads|analytics|.*(?:share|outbound|like|save))/i, 'frontend source must not call private or event-writing API paths')
  assert.doesNotMatch(content, /\b(?:fetch|sendBeacon)\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|window\.open\s*\(|(?:window\.)?location\.(?:href|assign|replace)\b/i, 'frontend source must not issue network, beacon, popup, or redirect requests')
  for (const filename of ['api.ts', 'context.tsx', 'pages-auth.tsx', 'pages-private.tsx']) {
    assert.equal(existsSync(path.join(sourceDir, filename)), false, `${filename} should be removed from the active source tree`)
  }
  return sourceFiles.length
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.nextId = 0
    this.pending = new Map()
    this.events = []
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
      } else this.events.push(message)
    })
  }

  async send(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 8000)
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() { this.socket.close() }
}

async function browserSmoke() {
  assert.equal(typeof WebSocket, 'function', 'Node WebSocket is required for request-audited browser smoke')
  const preview = spawn(process.execPath, [previewCli, 'preview', '--host', '127.0.0.1', '--port', '4317', '--strictPort'], {
    cwd: root,
    env: { ...process.env, VITE_DEMO_MODE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  preview.stdout.on('data', (chunk) => { serverLog += chunk.toString() })
  preview.stderr.on('data', (chunk) => { serverLog += chunk.toString() })
  const debugPort = await getFreePort()
  const profile = await mkdtemp(path.join(os.tmpdir(), 'launch-preview-chrome-'))
  const browser = spawn(chromium, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote',
    '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  browser.stderr.on('data', (chunk) => { browserLog += chunk.toString() })
  let client
  try {
    await waitFor(async () => {
      if (preview.exitCode !== null) throw new Error(`Vite preview exited: ${serverLog}`)
      const response = await fetch(`${baseUrl}/`)
      return response.ok
    }, `Vite preview did not start${serverLog}`)
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      if (!response.ok) return false
      return response.json()
    }, `Chromium DevTools did not start: ${browserLog}`)
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    const target = targets.find((item) => item.type === 'page')
    assert.ok(target?.webSocketDebuggerUrl, 'Chromium should expose a page target')
    client = new CdpClient(target.webSocketDebuggerUrl)
    await client.ready
    await client.send('Network.enable')
    await client.send('Page.enable')
    await client.send('Runtime.enable')
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

    const evaluate = async (expression) => {
      const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
      return result.result.value
    }
    const openRoute = async (route, marker) => {
      await client.send('Page.navigate', { url: `${baseUrl}${route}` })
      await waitFor(async () => evaluate(`document.body && document.body.innerText.includes(${JSON.stringify(marker)})`), `Route ${route} did not render marker ${marker}`)
      await new Promise((resolve) => setTimeout(resolve, 120))
      return evaluate(`({
        text: document.body.innerText,
        title: document.title,
        inputs: [...document.querySelectorAll('input')].map((input) => ({type: input.type, name: input.name, id: input.id, autocomplete: input.autocomplete})),
        forms: [...document.querySelectorAll('form')].map((form) => form.innerText),
        externalLinks: [...document.querySelectorAll('a[href^="http"]')].map((link) => link.href),
        apiLinks: [...document.querySelectorAll('a[href*="/api/"]')].map((link) => link.href),
        unsafeLinks: [...document.querySelectorAll('a')].map((link) => link.getAttribute('href') || '').filter((href) => /^(?:https?:|mailto:|tel:|[/]{2})/i.test(href) || /^[/]api(?:[/]|$)/i.test(href)),
        bodyWidth: document.body.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: innerHeight,
        titleRect: (() => { const el = document.querySelector('.explore-value'); if (!el) return null; const r = el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height,lineHeight:parseFloat(getComputedStyle(el).lineHeight)} })(),
        searchRect: (() => { const el = document.querySelector('.explore-search'); if (!el) return null; const r = el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom} })(),
        categoriesRect: (() => { const el = document.querySelector('.category-scroll'); if (!el) return null; const r = el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom} })(),
        firstCardRect: (() => { const el = document.querySelector('.launch-card'); if (!el) return null; const r = el.getBoundingClientRect(); return {top:r.top,bottom:r.bottom} })(),
        cardCount: document.querySelectorAll('.launch-card').length,
      })`)
    }

    const home = await openRoute('/', 'Explore launches')
    assert.match(home.title, /Synthetic demo/i)
    assert.match(home.text, /synthetic demo\s*[·-]\s*non-production\s*[·-]\s*read-only/i)
    assert.ok(home.titleRect && home.searchRect && home.categoriesRect && home.firstCardRect, 'mobile Explore must show value, search, categories, and launch card')
    assert.ok(home.titleRect.height <= home.titleRect.lineHeight * 1.6, 'mobile value statement should fit on one line')
    assert.ok(home.searchRect.top >= home.titleRect.bottom && home.categoriesRect.top >= home.searchRect.bottom && home.firstCardRect.top >= home.categoriesRect.top, 'mobile reading order must be value, search, category chips, then first card')
    assert.ok(home.firstCardRect.top < home.viewportHeight, 'the first launch card must begin above the fold')
    assert.ok(home.bodyWidth <= home.viewportWidth, `390px mobile layout must not overflow horizontally (${home.bodyWidth}px)`)
    assert.equal(home.cardCount, 6, 'Explore should show the six local synthetic launch fixtures by default')
    assert.equal(home.externalLinks.length, 0, 'demo pages must not expose external destinations')
    assert.equal(home.apiLinks.length, 0)
    assert.equal(home.forms.length, 0, 'Explore must not expose contact or write forms')
    assert.ok(home.inputs.every((input) => input.type === 'search'), 'Explore should expose search only, not account/contact data inputs')
    assert.doesNotMatch(home.text, /\b(?:contact|edit|funding|analytics|likes?|saves?|reports?|share)\b/i, 'Explore must not expose contact, edit, funding, analytics, engagement, report, or share actions')
    assert.equal(await evaluate(`JSON.stringify([...document.querySelectorAll('.category-chip')].map((button) => button.textContent.trim()))`), JSON.stringify(['All launches', 'Home & Living', 'Food & Beverage', 'Beauty & Personal Care', 'Fashion & Accessories', 'Community & Social', 'Arts & Crafts']), 'category chips must be limited to the approved fixture categories')
    assert.equal(await evaluate('document.querySelector(".clear-filters") === null'), true, 'default Explore should not spend first-viewport space on an inactive clear-filter control')
    assert.equal(await evaluate('document.querySelector("#launch-search")?.type'), 'search', 'Explore search should be exposed as a standard keyboard-operable search input')
    assert.equal(await evaluate('document.querySelector("#launch-search")?.tabIndex'), 0, 'Explore search should be keyboard-focusable')
    assert.doesNotMatch(home.text, /sign in|sign up|join aarambh|launch your idea/i, 'Explore must have no account/launch CTA')
    assert.ok(home.text.includes('Founder tools coming soon'), 'founder tools should be explicitly marked as coming soon')
    assert.equal(await evaluate(`document.querySelector('.top-links a[aria-label="How Aarambh works"]')?.getAttribute('href')`), '/how-it-works', 'the shared navigation should expose an internal How Aarambh works link')
    await evaluate(`document.querySelector('.top-links a[aria-label="How Aarambh works"]').click()`)
    await waitFor(async () => evaluate('document.querySelector(".page-heading h1")?.textContent.trim() === "How Aarambh works"'), 'the shared navigation link should open the informational route')
    await openRoute('/', 'Explore launches')

    const launchRoutes = await evaluate(`Array.from(document.querySelectorAll('.launch-card')).map((card) => {
      const title = card.querySelector('.launch-title a')
      return {
        route: title?.getAttribute('href'),
        title: title?.textContent.trim(),
        category: card.querySelector('.tag-category')?.textContent.trim(),
        type: card.querySelector('.tag-neutral')?.textContent.trim(),
        location: card.querySelector('.card-extras')?.textContent.trim() || null,
        brandHref: card.querySelector('.launch-card-meta .brand-link')?.getAttribute('href'),
        brandName: card.querySelector('.launch-card-meta .brand-link')?.textContent.trim(),
        founderHrefs: Array.from(card.querySelectorAll('.launch-card-meta .founder-link')).map((link) => link.getAttribute('href')),
        founderNames: Array.from(card.querySelectorAll('.launch-card-meta .founder-link')).map((link) => link.textContent.trim()),
        profileHrefs: Array.from(card.querySelectorAll('.launch-card-meta a')).map((link) => link.getAttribute('href')),
      }
    })`)
    assert.equal(launchRoutes.length, 6, 'all six current synthetic launches should have a detail link')
    assert.equal(new Set(launchRoutes.map((launch) => launch.route)).size, 6, 'each launch card should open a distinct detail route')
    assert.ok(launchRoutes.every((launch) => launch.route && launch.title && launch.brandHref && launch.brandName && launch.founderHrefs.length >= 1 && launch.founderHrefs.length === launch.founderNames.length && launch.profileHrefs.length >= 2), 'each launch card should link its title, brand, and founder fixture')
    const brandRoutes = [...new Set(launchRoutes.map((launch) => launch.brandHref))].map((route) => {
      const related = launchRoutes.filter((launch) => launch.brandHref === route)
      return { route, name: related[0].brandName, launchHrefs: related.map((launch) => launch.route), founderHrefs: [...new Set(related.flatMap((launch) => launch.founderHrefs))] }
    })
    const founderRoutes = [...new Set(launchRoutes.flatMap((launch) => launch.founderHrefs))].map((route) => {
      const related = launchRoutes.filter((launch) => launch.founderHrefs.includes(route))
      const firstIndex = related[0].founderHrefs.indexOf(route)
      return { route, name: related[0].founderNames[firstIndex], brandHrefs: [...new Set(related.map((launch) => launch.brandHref))] }
    })
    const assertFixtureBackedLeaderboardRows = (rows, label) => {
      assert.ok(rows.length > 0, `${label} should show local sample rows`)
      assert.equal(new Set(rows.map((row) => row.href)).size, rows.length, `${label} should not repeat a launch fixture`)
      rows.forEach((row, index) => {
        const fixture = launchRoutes.find((launch) => launch.route === row.href)
        assert.ok(fixture, `${label} target ${row.href} must match an Explore launch fixture`)
        assert.equal(row.title, fixture.title, `${label} row title must match its launch fixture`)
        assert.equal(row.brand, fixture.brandName, `${label} row brand must match its launch fixture`)
        assert.equal(row.founders, fixture.founderNames.join(', '), `${label} row founders must match its launch fixture`)
        assert.equal(row.position, String(index + 1).padStart(2, '0'), `${label} should show position only in sequential display order`)
        assert.match(row.href, /^\/launch\/[a-z0-9-]+$/, `${label} targets must be internal launch detail routes`)
      })
    }

    await client.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true })
    const narrowHome = await openRoute('/', 'Explore launches')
    assert.ok(narrowHome.titleRect && narrowHome.searchRect && narrowHome.categoriesRect && narrowHome.firstCardRect, '360px Explore must show the value, search, categories, and first card')
    assert.ok(narrowHome.titleRect.height <= narrowHome.titleRect.lineHeight * 1.6, '360px value statement should fit on one line')
    assert.ok(narrowHome.firstCardRect.top < narrowHome.viewportHeight, '360px first launch card must begin above the fold')
    assert.ok(narrowHome.bodyWidth <= narrowHome.viewportWidth, `360px mobile layout must not overflow horizontally (${narrowHome.bodyWidth}px)`)
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await openRoute('/', 'Explore launches')

    await evaluate(`(() => { const button = [...document.querySelectorAll('.category-chip')].find((item) => item.textContent.trim() === 'Food & Beverage'); button?.focus(); return true })()`)
    assert.equal(await evaluate('document.activeElement?.textContent.trim()'), 'Food & Beverage', 'category chip should receive programmatic keyboard focus')
    assert.equal(await evaluate('document.activeElement?.tabIndex'), 0, 'category chips should participate in the normal keyboard tab order')
    await evaluate('document.activeElement.click()')
    await waitFor(async () => evaluate('document.querySelector(".category-chip[aria-pressed=true]")?.textContent.trim() === "Food & Beverage"'), 'activating the focused category chip should apply that filter')
    await waitFor(async () => evaluate('document.querySelectorAll(".launch-card").length === 1'), 'Category filter should show one synthetic launch')
    assert.match(await evaluate('document.querySelector(".launch-card").innerText'), /Mitti & More/)
    assert.equal(await evaluate('document.activeElement?.textContent.trim()'), 'Food & Beverage', 'category chips should be focusable')
    await evaluate('document.querySelector("#launch-search").focus()')
    await client.send('Input.insertText', { text: 'Mitti' })
    await waitFor(async () => evaluate('document.querySelectorAll(".launch-card").length === 1 && document.querySelectorAll(".matching-profile-link").length === 1'), 'Combined category and brand-name search should retain its fixture launch and expose the matching profile')
    assert.match(await evaluate('document.querySelector(".launch-card").innerText'), /Mitti & More/)
    assert.equal(await evaluate('document.querySelector(".matching-profile-link")?.getAttribute("href")'), '/brand/mitti-and-more', 'brand-name match should directly link to its internal brand profile')
    assert.equal(await evaluate('document.querySelector(".muted-label")?.textContent.includes("1 matching profile")'), true, 'result status should announce the matching profile count')
    await evaluate('document.querySelector(".search-clear").click()')
    assert.equal(await evaluate('document.querySelector("#launch-search").value'), '', 'Clear search should remove the query')
    assert.equal(await evaluate('document.querySelector(".category-chip[aria-pressed=true]")?.textContent.trim()'), 'Food & Beverage', 'clearing search alone should preserve the selected category')
    await evaluate('document.querySelector("#launch-search").focus()')
    await client.send('Input.insertText', { text: 'Kala' })
    await waitFor(async () => evaluate('document.querySelectorAll(".launch-card").length === 0'), 'a category and query with no intersection should show no launch results')
    assert.match(await evaluate('document.querySelector(".empty-state").innerText'), /No synthetic launch matches those filters/i)
    assert.equal(await evaluate('document.querySelectorAll(".matching-profile-link").length'), 0, 'a category mismatch must not leak an out-of-category brand profile result')
    assert.equal(await evaluate('document.querySelector(".clear-filters")?.textContent.trim()'), 'Clear filters', 'an obvious clear-all path should appear while filters are active')
    await evaluate('document.querySelector(".clear-filters").focus()')
    assert.equal(await evaluate('document.activeElement?.classList.contains("clear-filters")'), true, 'the clear-all path should be keyboard-focusable')
    assert.equal(await evaluate('document.activeElement?.tabIndex'), 0, 'the clear-all path should participate in the normal keyboard tab order')
    await evaluate('document.activeElement.click()')
    await waitFor(async () => evaluate('document.querySelectorAll(".launch-card").length === 6'), 'activating Clear filters by keyboard should restore all fixture launches')
    assert.equal(await evaluate('document.querySelector("#launch-search").value'), '', 'Clear filters should clear the search query')
    assert.equal(await evaluate('document.querySelector(".category-chip[aria-pressed=true]")?.textContent.trim()'), 'All launches', 'Clear filters should reset the category to All launches')
    assert.equal(await evaluate('document.querySelector(".clear-filters") === null'), true, 'clear-all should disappear when no filters are active')

    await evaluate('document.querySelector("#launch-search").focus()')
    await client.send('Input.insertText', { text: 'monsoon' })
    await waitFor(async () => evaluate('document.querySelectorAll(".launch-card").length === 1'), 'launch-title search should match a local fixture')
    assert.match(await evaluate('document.querySelector(".launch-title").innerText'), /monsoon/i)
    await evaluate('document.querySelector(".search-clear").click()')
    await evaluate('document.querySelector("#launch-search").focus()')
    await client.send('Input.insertText', { text: 'Kala Clay Studio' })
    await waitFor(async () => evaluate('[...document.querySelectorAll(".matching-profile-link")].some((link) => link.getAttribute("href") === "/brand/kala-clay-studio")'), 'brand-name search should expose a direct internal profile link')
    assert.equal(await evaluate('[...document.querySelectorAll(".matching-profile-link")].find((link) => link.getAttribute("href") === "/brand/kala-clay-studio")?.tabIndex'), 0, 'matching brand profile links should be keyboard-focusable')
    await evaluate('[...document.querySelectorAll(".matching-profile-link")].find((link) => link.getAttribute("href") === "/brand/kala-clay-studio").click()')
    await waitFor(async () => evaluate('document.querySelector("#brand-profile-title")?.textContent.trim() === "Kala Clay Studio"'), 'following a brand search match should open its internal synthetic brand profile')

    await openRoute('/', 'Explore launches')
    await evaluate('document.querySelector("#launch-search").focus()')
    await client.send('Input.insertText', { text: 'Ananya Mehta' })
    await waitFor(async () => evaluate('[...document.querySelectorAll(".matching-profile-link")].some((link) => link.getAttribute("href") === "/founder/sample-founder-ananya")'), 'founder-name search should expose a direct internal profile link')
    assert.equal(await evaluate('document.querySelectorAll(".launch-card").length'), 2, 'founder-name search should find all related fixture launches')
    assert.equal(await evaluate('[...document.querySelectorAll(".matching-profile-link")].find((link) => link.getAttribute("href") === "/founder/sample-founder-ananya")?.tabIndex'), 0, 'matching founder profile links should be keyboard-focusable')
    await evaluate('[...document.querySelectorAll(".matching-profile-link")].find((link) => link.getAttribute("href") === "/founder/sample-founder-ananya").click()')
    await waitFor(async () => evaluate('document.querySelector("#founder-profile-title")?.textContent.trim() === "Ananya Mehta"'), 'following a founder search match should open its internal synthetic founder profile')

    await openRoute('/', 'Explore launches')
    await evaluate('document.querySelector("#launch-search").focus()')
    await client.send('Input.insertText', { text: 'no-such-fixture-match' })
    await waitFor(async () => evaluate('document.querySelectorAll(".launch-card").length === 0'), 'unmatched search should show the no-results state')
    assert.match(await evaluate('document.querySelector(".empty-state h2")?.textContent'), /No matching demo launches/)
    assert.equal(await evaluate('document.querySelector(".empty-state button")?.textContent.trim()'), 'Clear all filters', 'no-results state should provide a clear recovery path')
    await evaluate('document.querySelector(".empty-state button").click()')
    await waitFor(async () => evaluate('document.querySelectorAll(".launch-card").length === 6'), 'the no-results recovery button should restore the default fixture feed')

    await client.send('Page.navigate', { url: `${baseUrl}/` })
    await waitFor(async () => evaluate('document.querySelectorAll(".launch-card").length === 6'), 'Explore should reload with fixture data')
    const png = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(screenshotPath, Buffer.from(png.data, 'base64'))

    const publicRoutes = [
      ['/how-it-works', 'How Aarambh works'],
      ['/launch/kala-clay-monsoon-objects', 'Objects that bring the monsoon home'],
      ['/brand/kala-clay-studio', 'Kala Clay Studio'],
      ['/founder/sample-founder-ananya', 'Ananya Mehta'],
    ]
    for (const [route, marker] of publicRoutes) {
      const page = await openRoute(route, marker)
      assert.equal(page.externalLinks.length, 0, `${route} must not contain external destinations`)
      assert.equal(page.apiLinks.length, 0, `${route} must not link to an API endpoint`)
      assert.ok(page.bodyWidth <= page.viewportWidth, `${route} must not overflow at mobile width`)
    }

    const howPage = await openRoute('/how-it-works', 'How Aarambh works')
    const howInfo = await evaluate(`(() => ({
      title: document.querySelector('.page-heading h1')?.textContent.trim(),
      steps: Array.from(document.querySelectorAll('.how-step h3')).map((heading) => heading.textContent.trim()),
      content: document.querySelector('.how-it-works-page')?.innerText || '',
      controls: document.querySelectorAll('button, input, textarea, select, form, [role="button"]').length,
      backHref: document.querySelector('.how-it-works-page .back-link')?.getAttribute('href'),
      browseHrefs: Array.from(document.querySelectorAll('.how-preview-links a')).map((link) => link.getAttribute('href')),
    }))()`)
    assert.equal(howInfo.title, 'How Aarambh works', 'the informational page should have a clear title')
    assert.deepEqual(howInfo.steps, ['Explore sample launches', 'Open a local detail page', 'Read sample positions carefully'], 'the guide should explain the local browsing flow')
    assert.match(howInfo.content, /fictional records and images are bundled locally/i, 'the guide should state that examples are bundled fixtures')
    assert.match(howInfo.content, /the frontend does not call an API/i, 'the guide should explain the local-only data boundary')
    assert.match(howInfo.content, /not live/i, 'the guide should distinguish sample positions from live rankings')
    assert.equal(howInfo.controls, 0, 'the informational page must not add forms or interactive write controls')
    assert.equal(howInfo.backHref, '/', 'the guide should provide an internal path back to Explore')
    assert.deepEqual(howInfo.browseHrefs, ['/', '/leaderboard'], 'guide browse links should stay on internal demo routes')
    assert.equal(howPage.inputs.length, 0, 'the guide must not expose personal-data inputs')
    assert.equal(howPage.forms.length, 0, 'the guide must not expose forms')
    assert.equal(howPage.externalLinks.length, 0, 'the guide must not expose external destinations')
    assert.equal(howPage.apiLinks.length, 0, 'the guide must not link to API routes')
    assert.equal(howPage.unsafeLinks.length, 0, 'the guide must use only internal, non-API navigation')
    assert.ok(howPage.bodyWidth <= howPage.viewportWidth, 'the guide must not overflow at 390px mobile width')
    await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true })
    const narrowHowPage = await openRoute('/how-it-works', 'How Aarambh works')
    assert.ok(narrowHowPage.bodyWidth <= narrowHowPage.viewportWidth, `the guide and shared navigation must not overflow at 320px (${narrowHowPage.bodyWidth}px > ${narrowHowPage.viewportWidth}px)`)
    assert.ok(await evaluate('document.querySelector(".top-links")?.getBoundingClientRect().right <= document.documentElement.clientWidth'), 'the compact navigation should remain within the 320px viewport')
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

    const leaderboardPage = await openRoute('/leaderboard', 'Sample leaderboard')
    const inspectLeaderboard = () => evaluate(`(() => ({
      title: document.querySelector('.page-heading h1')?.textContent.trim(),
      note: document.querySelector('.leaderboard-weight-note')?.textContent.trim(),
      caveat: document.querySelector('.leaderboard-boundary-note')?.textContent.trim(),
      periodButtons: Array.from(document.querySelectorAll('.leaderboard-period-button')).map((button) => ({label: button.textContent.trim(), pressed: button.getAttribute('aria-pressed')})),
      categoryOptions: Array.from(document.querySelectorAll('#leaderboard-category option')).map((option) => ({label: option.textContent.trim(), value: option.value})),
      backHref: document.querySelector('.leaderboard-back-link')?.getAttribute('href'),
      rows: Array.from(document.querySelectorAll('.leaderboard-row')).map((row) => ({
        position: row.querySelector('.leaderboard-position')?.textContent.trim(),
        title: row.querySelector('h2')?.textContent.trim(),
        href: row.querySelector('.leaderboard-row-link')?.getAttribute('href'),
        brand: row.querySelector('.leaderboard-brand')?.textContent.trim(),
        founders: row.querySelector('.leaderboard-row-meta > span:last-child')?.textContent.trim().replace(/^Founders?:\\s*/, ''),
      })),
      emptyHeading: document.querySelector('.leaderboard-empty h2')?.textContent.trim() || null,
      text: document.body.innerText,
      forms: document.querySelectorAll('form').length,
      externalLinks: Array.from(document.querySelectorAll('a[href^="http"], a[href^="mailto:"], a[href^="tel:"], a[href^="//"]')).map((link) => link.getAttribute('href')),
      apiLinks: Array.from(document.querySelectorAll('a[href^="/api"], a[href*="/api/"]')).map((link) => link.getAttribute('href')),
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }))()`)
    const leaderboard = await inspectLeaderboard()
    assert.equal(leaderboard.title, 'Sample leaderboard', 'leaderboard screen title should be explicit')
    assert.equal(leaderboard.note, 'Illustrative only; ranking weights are still undecided.', 'persistent note must use the approved exact wording')
    assert.match(leaderboardPage.text, /not live or engagement-based/i, 'leaderboard must clearly state its order is not live or engagement-based')
    assert.match(leaderboard.caveat, /do not indicate sales, quality, popularity, or any real-world ranking/i, 'leaderboard must not imply commercial, quality, popularity, or real ranking claims')
    assert.deepEqual(leaderboard.periodButtons, [{ label: 'Weekly', pressed: 'true' }, { label: 'Monthly', pressed: 'false' }], 'Weekly and Monthly local sample views should be available')
    assert.deepEqual(leaderboard.categoryOptions, [
      { label: 'All categories', value: '' },
      { label: 'Home & Living', value: 'home-living' },
      { label: 'Food & Beverage', value: 'food-beverage' },
      { label: 'Beauty & Personal Care', value: 'beauty-care' },
      { label: 'Fashion & Accessories', value: 'fashion-accessories' },
      { label: 'Community & Social', value: 'community' },
      { label: 'Arts & Crafts', value: 'arts-crafts' },
    ], 'category filter should use only local fixture categories')
    assert.equal(leaderboard.backHref, '/', 'leaderboard should provide a direct internal path back to Explore')
    assertFixtureBackedLeaderboardRows(leaderboard.rows, 'Weekly leaderboard')
    assert.equal(leaderboard.rows.length, 4, 'Weekly sample view should use its four explicit local fixture rows')
    assert.equal(leaderboardPage.forms.length, 0, 'leaderboard must not expose contact or write forms')
    assert.equal(leaderboardPage.externalLinks.length, 0, 'leaderboard must not expose external destinations')
    assert.equal(leaderboardPage.apiLinks.length, 0, 'leaderboard must not link to an API route')
    assert.doesNotMatch(leaderboard.text, /\b(?:formula|scores?|likes?|saves?|clicks?)\b/i, 'leaderboard must not render a formula or engagement metrics')
    assert.doesNotMatch(leaderboard.text, /\b(?:contact|edit|report)\b/i, 'leaderboard must not expose contact, edit, or report controls')
    assert.ok(leaderboard.bodyWidth <= leaderboard.viewportWidth, 'leaderboard must not overflow at 390px mobile width')
    await writeFile(leaderboardScreenshotPath, Buffer.from((await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'))

    await evaluate(`document.querySelector('.leaderboard-period-button:nth-child(2)').click()`)
    await waitFor(async () => (await inspectLeaderboard()).rows.length === 6, 'Monthly should switch to its six local fixture rows')
    const monthlyLeaderboard = await inspectLeaderboard()
    assert.equal(monthlyLeaderboard.periodButtons[1].pressed, 'true', 'Monthly should be visibly selected after activation')
    assertFixtureBackedLeaderboardRows(monthlyLeaderboard.rows, 'Monthly leaderboard')
    await evaluate(`(() => { const select = document.querySelector('#leaderboard-category'); select.value = 'community'; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await waitFor(async () => (await inspectLeaderboard()).rows.length === 1, 'monthly category filter should retain only its matching fixture')
    const communityLeaderboard = await inspectLeaderboard()
    assert.equal(communityLeaderboard.rows[0].href, '/launch/aangan-community-gardens', 'category filtering should resolve the fixture-backed community launch')
    assertFixtureBackedLeaderboardRows(communityLeaderboard.rows, 'Monthly community filter')
    await evaluate(`document.querySelector('.leaderboard-period-button:nth-child(1)').click()`)
    await waitFor(async () => Boolean((await inspectLeaderboard()).emptyHeading), 'Weekly with an unmatched category should show a distinct empty sample state')
    const emptyLeaderboard = await inspectLeaderboard()
    assert.equal(emptyLeaderboard.rows.length, 0, 'empty sample view must not show ranked rows')
    assert.equal(emptyLeaderboard.emptyHeading, 'No sample launches in this view', 'empty state should be distinct from sample positions')
    assert.doesNotMatch(emptyLeaderboard.text, /\b(?:formula|scores?|likes?|saves?|clicks?)\b/i, 'empty state must not introduce formula or engagement metrics')

    await openRoute('/leaderboard', 'Sample leaderboard')
    await evaluate(`document.querySelector('.leaderboard-row-link').click()`)
    await waitFor(async () => evaluate('document.querySelector("#launch-title")?.textContent.trim() === "Objects that bring the monsoon home"'), 'following a leaderboard row should open its internal launch detail')
    assert.equal(await evaluate('document.querySelector(".back-link")?.getAttribute("href")'), '/', 'launch detail opened from the leaderboard should offer Back to Explore')
    await evaluate('document.querySelector(".back-link").click()')
    await waitFor(async () => evaluate('document.querySelector("#explore-title")?.textContent.trim() === "See what’s just launched."'), 'launch detail should provide a working internal return to Explore')

    assert.equal(brandRoutes.length, 6, 'all six synthetic fixture brands should be reachable from launch details')
    assert.equal(founderRoutes.length, 6, 'all six unique synthetic fixture founders should be reachable from launch details')
    const inspectProfilePolicy = async () => evaluate(`(() => {
      const text = document.body.innerText
      const links = Array.from(document.querySelectorAll('a'))
      return {
        controls: document.querySelectorAll('button, input, textarea, select, form, [role="button"]').length,
        restrictedCopy: /\\b(?:claim|edit|funding|analytics|sign[ -]in|sign[ -]up|like|save|report|share)\\b/i.test(text),
        contactDetails: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}|\\+?\\d[\\d\\s().-]{7,}\\d/i.test(text),
        unsafeLink: links.some((link) => /^(?:https?:|mailto:|tel:|\\/\\/)/i.test(link.getAttribute('href') || '') || /^\\/api(?:\\/|$)/i.test(link.getAttribute('href') || '')),
        exploreHref: document.querySelector('.back-link')?.getAttribute('href'),
      }
    })()`)

    for (const brand of brandRoutes) {
      const page = await openRoute(brand.route, brand.name)
      const profile = await evaluate(`(() => ({
        name: document.querySelector('#brand-profile-title')?.textContent.trim(),
        syntheticLabel: document.querySelector('.profile-hero .tag-neutral')?.textContent.trim(),
        tagline: document.querySelector('.profile-tagline')?.textContent.trim(),
        storyHeading: document.querySelector('#brand-story-heading')?.textContent.trim(),
        story: document.querySelector('#brand-story-heading + p')?.textContent.trim(),
        launchHrefs: Array.from(document.querySelectorAll('.profile-section .launch-title a')).map((link) => link.getAttribute('href')),
        founderHrefs: Array.from(document.querySelector('[aria-labelledby="brand-founders-heading"]')?.querySelectorAll('a[href^="/founder/"]') || []).map((link) => link.getAttribute('href')),
      }))()`)
      const policy = await inspectProfilePolicy()
      assert.equal(profile.name, brand.name, `${brand.route} should show its linked fixture brand identity`)
      assert.equal(profile.syntheticLabel, 'Synthetic demo brand', `${brand.route} should visibly identify synthetic brand data`)
      assert.ok(profile.tagline, `${brand.route} should show its existing synthetic brand tagline`)
      assert.equal(profile.storyHeading, 'Brand story', `${brand.route} should label the fixture description as the brand story`)
      assert.ok(profile.story, `${brand.route} should show its existing fixture description`)
      assert.deepEqual([...profile.launchHrefs].sort(), [...brand.launchHrefs].sort(), `${brand.route} should link every related launch and no unrelated launch`)
      assert.deepEqual([...profile.founderHrefs].sort(), [...brand.founderHrefs].sort(), `${brand.route} should link every associated founder`)
      assert.equal(policy.exploreHref, '/', `${brand.route} should offer a clear Explore return`)
      assert.equal(policy.controls, 0, `${brand.route} must not expose buttons, forms, or data-entry controls`)
      assert.equal(policy.restrictedCopy, false, `${brand.route} must not expose claim/edit, funding, analytics, auth, engagement, report, or share UI`)
      assert.equal(policy.contactDetails, false, `${brand.route} must not display contact details`)
      assert.equal(policy.unsafeLink, false, `${brand.route} must use only internal fixture-local navigation`)
      assert.equal(page.externalLinks.length, 0, `${brand.route} must not contain external destinations`)
      assert.equal(page.apiLinks.length, 0, `${brand.route} must not link to an API endpoint`)
      assert.ok(page.bodyWidth <= page.viewportWidth, `${brand.route} must not overflow at mobile width`)
      if (brand.route === brandRoutes[0].route) await writeFile(brandScreenshotPath, Buffer.from((await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'))
    }

    for (const founder of founderRoutes) {
      const page = await openRoute(founder.route, founder.name)
      const profile = await evaluate(`(() => ({
        name: document.querySelector('#founder-profile-title')?.textContent.trim(),
        syntheticLabel: document.querySelector('.profile-hero .tag-neutral')?.textContent.trim(),
        bio: document.querySelector('.profile-hero p:not(.founder-role):not(.profile-location)')?.textContent.trim(),
        brandHrefs: Array.from(document.querySelectorAll('.profile-section .profile-link-list a[href^="/brand/"]')).map((link) => link.getAttribute('href')),
      }))()`)
      const policy = await inspectProfilePolicy()
      assert.equal(profile.name, founder.name, `${founder.route} should show its linked fixture founder identity`)
      assert.equal(profile.syntheticLabel, 'Synthetic demo founder', `${founder.route} should visibly identify synthetic founder data`)
      assert.match(profile.bio, /fictional profile text/i, `${founder.route} should show the synthetic founder bio`)
      assert.deepEqual([...profile.brandHrefs].sort(), [...founder.brandHrefs].sort(), `${founder.route} should show and link every associated brand`)
      assert.equal(policy.exploreHref, '/', `${founder.route} should offer a clear Explore return`)
      assert.equal(policy.controls, 0, `${founder.route} must not expose buttons, forms, or data-entry controls`)
      assert.equal(policy.restrictedCopy, false, `${founder.route} must not expose claim/edit, funding, analytics, auth, engagement, report, or share UI`)
      assert.equal(policy.contactDetails, false, `${founder.route} must not display contact details`)
      assert.equal(policy.unsafeLink, false, `${founder.route} must use only internal fixture-local navigation`)
      assert.equal(page.externalLinks.length, 0, `${founder.route} must not contain external destinations`)
      assert.equal(page.apiLinks.length, 0, `${founder.route} must not link to an API endpoint`)
      assert.ok(page.bodyWidth <= page.viewportWidth, `${founder.route} must not overflow at mobile width`)
      if (founder.route === founderRoutes[0].route) await writeFile(founderScreenshotPath, Buffer.from((await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'))
    }

    for (const [route, marker] of [['/brand/not-in-local-fixtures', 'Sample page not found'], ['/founder/not-in-local-fixtures', 'Sample page not found']]) {
      const page = await openRoute(route, marker)
      assert.equal(await evaluate('document.querySelector(".empty-state a")?.getAttribute("href")'), '/', `${route} should provide a clear Explore return`)
      assert.match(page.text, /This synthetic record is not in the local demo collection/i, `${route} should explain the unavailable fixture`)
      assert.equal(page.externalLinks.length, 0, `${route} must not contain external destinations`)
      assert.ok(page.bodyWidth <= page.viewportWidth, `${route} must not overflow at mobile width`)
    }

    for (const launch of launchRoutes) {
      const page = await openRoute(launch.route, launch.title)
      const detail = await evaluate(`(() => ({
        title: document.querySelector('#launch-title')?.textContent.trim(),
        category: document.querySelector('.detail-kicker-row .tag-category')?.textContent.trim(),
        type: document.querySelector('.detail-kicker-row .tag-neutral')?.textContent.trim(),
        sampleLabel: document.querySelector('.detail-kicker-row .sample-label')?.textContent.trim(),
        location: document.querySelector('.detail-location')?.textContent.trim() || null,
        profileHrefs: Array.from(document.querySelectorAll('.detail-profile-links a')).map((link) => link.getAttribute('href')),
        imageAlts: Array.from(document.querySelectorAll('.launch-gallery-stage img')).map((image) => image.alt),
        imageSources: Array.from(document.querySelectorAll('.launch-gallery-stage img')).map((image) => image.getAttribute('src')),
        positionButtons: Array.from(document.querySelectorAll('.gallery-position-button')).map((button) => ({label: button.getAttribute('aria-label'), current: button.getAttribute('aria-current'), disabled: button.disabled, tabIndex: button.tabIndex})),
        arrowButtons: Array.from(document.querySelectorAll('.gallery-arrow')).map((button) => ({label: button.getAttribute('aria-label'), disabled: button.disabled})),
        carousel: document.querySelector('.launch-gallery')?.getAttribute('aria-roledescription'),
        backHref: document.querySelector('.back-link')?.getAttribute('href'),
        story: document.querySelector('#launch-story-heading')?.textContent.trim(),
      }))()`)
      assert.equal(detail.title, launch.title, `${launch.route} should render the title from its own launch fixture`)
      assert.equal(detail.category, launch.category, `${launch.route} should render its fixture category`)
      assert.equal(detail.type, launch.type, `${launch.route} should render its fixture launch type`)
      assert.equal(detail.sampleLabel, 'Synthetic sample', `${launch.route} should visibly identify synthetic sample content`)
      assert.equal(detail.location, launch.location, `${launch.route} should render its optional fixture location`)
      assert.deepEqual([...detail.profileHrefs].sort(), [...launch.profileHrefs].sort(), `${launch.route} should link the brand and founders from its own fixture`)
      assert.equal(detail.carousel, 'carousel', `${launch.route} should expose an accessible carousel region`)
      assert.ok(detail.imageAlts.length >= 1 && detail.imageAlts.every((alt) => alt.trim().length > 0), `${launch.route} images must have descriptive alt text`)
      assert.ok(detail.imageSources.every((src) => src.startsWith('/images/')), `${launch.route} images must use bundled local assets`)
      assert.ok(detail.positionButtons.length >= detail.imageAlts.length, `${launch.route} should expose position controls for its active slide`)
      assert.ok(detail.positionButtons.every((button, index) => button.label === `Show image ${index + 1} of ${detail.positionButtons.length}` && !button.disabled && button.tabIndex >= 0), `${launch.route} position controls must have explicit image-position names and be keyboard-focusable`)
      assert.equal(detail.positionButtons.filter((button) => button.current === 'true').length, 1, `${launch.route} should identify exactly one active image position`)
      assert.equal(detail.arrowButtons.find((button) => button.label === 'Previous image')?.disabled, true, `${launch.route} previous button should be disabled on the first image`)
      assert.equal(detail.arrowButtons.find((button) => button.label === 'Next image')?.disabled, detail.positionButtons.length === 1, `${launch.route} next button should be disabled on the last image, including a single-image carousel`)
      assert.ok(detail.backHref === '/', `${launch.route} should provide a direct Back to Explore link`)
      assert.equal(detail.story, 'Launch story', `${launch.route} should include the fixture story`)
      assert.equal(page.externalLinks.length, 0, `${launch.route} must not expose external destinations`)
      assert.equal(page.apiLinks.length, 0, `${launch.route} must not link to an API endpoint`)
      assert.ok(page.bodyWidth <= page.viewportWidth, `${launch.route} must not overflow at mobile width`)
    }

    const multiImageLaunch = launchRoutes.find((launch) => launch.route === '/launch/nila-botanics-skin-oil')
    assert.ok(multiImageLaunch, 'the existing Nila sample fixture should exercise multiple local images')
    await openRoute(multiImageLaunch.route, multiImageLaunch.title)
    assert.equal(await evaluate('document.querySelectorAll(".gallery-position-button").length'), 2, 'the multi-image fixture should expose two image-position controls')
    assert.equal(await evaluate('document.querySelector(".gallery-previous").disabled'), true, 'previous should be disabled on the first image')
    assert.equal(await evaluate('document.querySelector(".gallery-next").disabled'), false, 'next should be enabled before the last image')
    await writeFile(detailScreenshotPath, Buffer.from((await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'))
    const pressCarouselKey = async (key, windowsVirtualKeyCode) => {
      await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode })
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode })
    }
    await evaluate('document.querySelector(".gallery-previous").click()')
    assert.equal(await evaluate('document.querySelector(".launch-gallery-stage").getAttribute("aria-label")'), 'Image 1 of 2', 'clicking disabled previous on the first image must not wrap')
    await evaluate(`document.querySelector('.launch-gallery').focus()`)
    assert.equal(await evaluate('document.activeElement?.getAttribute("aria-roledescription")'), 'carousel', 'the multi-image carousel region should receive keyboard focus')
    await pressCarouselKey('ArrowLeft', 37)
    assert.equal(await evaluate('document.querySelector(".launch-gallery-stage").getAttribute("aria-label")'), 'Image 1 of 2', 'ArrowLeft on the first image must not wrap')
    await pressCarouselKey('ArrowRight', 39)
    await waitFor(async () => evaluate('document.querySelector(".launch-gallery-stage")?.getAttribute("aria-label") === "Image 2 of 2"'), 'ArrowRight on the focused carousel should advance the active image')
    assert.equal(await evaluate('document.querySelector(".gallery-previous").disabled'), false, 'previous should be enabled on the last image')
    assert.equal(await evaluate('document.querySelector(".gallery-next").disabled'), true, 'next should be disabled on the last image')
    await evaluate('document.querySelector(".gallery-next").click()')
    assert.equal(await evaluate('document.querySelector(".launch-gallery-stage").getAttribute("aria-label")'), 'Image 2 of 2', 'clicking disabled next on the last image must not wrap')
    await evaluate('document.querySelector(".launch-gallery").focus()')
    await pressCarouselKey('ArrowRight', 39)
    assert.equal(await evaluate('document.querySelector(".launch-gallery-stage").getAttribute("aria-label")'), 'Image 2 of 2', 'ArrowRight on the last image must not wrap')
    await evaluate(`document.querySelector('.gallery-position-button[aria-label="Show image 2 of 2"]').focus()`)
    await pressCarouselKey('ArrowLeft', 37)
    await waitFor(async () => evaluate('document.querySelector(".launch-gallery-stage")?.getAttribute("aria-label") === "Image 1 of 2"'), 'ArrowLeft from a focused position control should navigate the carousel')
    await pressCarouselKey('ArrowLeft', 37)
    assert.equal(await evaluate('document.querySelector(".launch-gallery-stage").getAttribute("aria-label")'), 'Image 1 of 2', 'ArrowLeft from the first position control must not wrap')
    await evaluate('document.querySelector(".gallery-next").click()')
    await waitFor(async () => evaluate('document.querySelector(".launch-gallery-stage")?.getAttribute("aria-label") === "Image 2 of 2"'), 'clicking next should advance to the last image')
    await evaluate('document.querySelector(".gallery-previous").click()')
    await waitFor(async () => evaluate('document.querySelector(".launch-gallery-stage")?.getAttribute("aria-label") === "Image 1 of 2"'), 'clicking previous should return to the first image')
    await evaluate(`document.querySelector('.gallery-position-button[aria-label="Show image 1 of 2"]').focus()`)
    assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'), 'Show image 1 of 2', 'the active position control should remain keyboard-operable')

    const unavailable = await openRoute('/launch/not-in-local-fixtures', 'Launch unavailable')
    assert.match(unavailable.text, /not in the current local synthetic sample collection/i)
    assert.equal(await evaluate('document.querySelector(".empty-state a")?.getAttribute("href")'), '/', 'an unavailable launch should offer a clear Explore path')
    assert.equal(unavailable.externalLinks.length, 0)
    assert.ok(unavailable.bodyWidth <= unavailable.viewportWidth)

    const blockedRoutes = []
    for (const route of forbiddenPaths) {
      const page = await openRoute(route, 'This page isn’t part of the preview.')
      assert.equal(page.inputs.length, 0, `${route} must not render personal-data inputs`)
      assert.equal(page.forms.length, 0, `${route} must not render forms`)
      assert.doesNotMatch(page.text, /password|email address|create account|reset link|verify your email/i, `${route} must not expose account or recovery UI`)
      blockedRoutes.push(route)
    }

    const requests = client.events.filter((event) => event.method === 'Network.requestWillBeSent').map((event) => ({ url: event.params.request.url, method: event.params.request.method, resourceType: event.params.type }))
    const httpRequests = requests.filter((request) => /^https?:/i.test(request.url))
    assert.ok(httpRequests.length > 0, 'browser should have loaded the local production preview')
    assert.ok(httpRequests.every((request) => request.url.startsWith(baseUrl)), `all browser HTTP requests must remain local: ${httpRequests.map((request) => request.url).join(', ')}`)
    assert.equal(httpRequests.filter((request) => !['GET', 'HEAD'].includes(request.method)).length, 0, 'browser must not issue write requests')
    const forbiddenRequests = httpRequests.filter(({ url, resourceType }) => {
      const pathname = new URL(url).pathname
      const apiOrPrivate = /\/api(?:\/|$)|\/auth(?:\/|$)|\/me(?:\/|$)/i.test(pathname)
      const trackingSubrequest = /\/(?:events?|analytics|tracking|track|clicks?|outbound|share|saves?|likes?|reports?)(?:\/|$)/i.test(pathname) && resourceType !== 'Document'
      return apiOrPrivate || trackingSubrequest
    })
    assert.equal(forbiddenRequests.length, 0, `browser must not issue API, private, or non-document tracking/event requests: ${forbiddenRequests.map((request) => `${request.method} ${request.url} (${request.resourceType})`).join(', ')}`)
    return { publicRoutes: publicRoutes.length + launchRoutes.length + 1, blockedRoutes: blockedRoutes.length, launchesAudited: launchRoutes.length, leaderboardRowsAudited: leaderboard.rows.length + monthlyLeaderboard.rows.length, brandsAudited: brandRoutes.length, foundersAudited: founderRoutes.length, keyboardCarousel: true, browserHttpRequests: httpRequests.length, screenshotPath, detailScreenshotPath, leaderboardScreenshotPath, brandScreenshotPath, founderScreenshotPath }
  } finally {
    client?.close()
    browser.kill('SIGTERM')
    preview.kill('SIGTERM')
    await Promise.all([browser, preview].map((child) => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve()
      child.once('exit', resolve)
      setTimeout(resolve, 1500)
    })))
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
  }
}

try {
  const sourceCount = auditSource()
  const workerResult = await runWorkerRouteTests()
  const browserResult = await browserSmoke()
  console.log(`PASS: source audit inspected ${sourceCount} active frontend modules; no personal-data inputs or account/write handlers.`)
  console.log(`PASS: Worker returned local 404s for ${workerResult.blockedCases} /api route/method cases; upstream fetches=${workerResult.upstreamFetches}, /api asset lookups=${workerResult.apiAssetFetches}, credentials echoed=${workerResult.credentialsEchoed}, port-4000 traffic=${workerResult.port4000Traffic}.`)
  console.log(`PASS: production browser rendered ${browserResult.publicRoutes} public routes and denied ${browserResult.blockedRoutes} account/workspace paths without forms.`)
  console.log('PASS: How Aarambh works is reachable through internal navigation, explains local synthetic/read-only behavior, exposes no forms or external/API links, and fits 320px mobile width.')
  console.log('PASS: Explore matched launch, brand, and founder names; combined category+query, clear/no-match recovery, keyboard/focus access, and internal profile links worked without API, external, or write requests.')
  console.log(`PASS: ${browserResult.launchesAudited} launch cards resolved to their matching fixture-backed detail route and local brand/founder links; unavailable launch has an Explore path.`)
  console.log(`PASS: sample leaderboard audited ${browserResult.leaderboardRowsAudited} fixture-backed Weekly/Monthly rows, exact note, local category filter, distinct empty state, internal detail/Explore navigation, and no formula or engagement metrics.`)
  console.log(`PASS: profile route graph covered ${browserResult.brandsAudited} brands and ${browserResult.foundersAudited} founders; related launches, founder/brand links, missing profile IDs, synthetic labels, Explore returns, and no-contact/no-action-control rules passed.`)
  console.log(`PASS: carousel image alts, explicitly named focusable position buttons, endpoint-disabled arrows, and non-wrapping click/keyboard navigation were audited without autoplay.`)
  console.log(`PASS: mobile Explore at 360x800 and 390x844 kept the value line, search, categories, and first card above the fold; local-only browser HTTP requests: ${browserResult.browserHttpRequests}.`)
  console.log(`SCREENSHOT: ${browserResult.screenshotPath}`)
  console.log(`DETAIL SCREENSHOT: ${browserResult.detailScreenshotPath}`)
  console.log(`LEADERBOARD SCREENSHOT: ${browserResult.leaderboardScreenshotPath}`)
  console.log(`BRAND PROFILE SCREENSHOT: ${browserResult.brandScreenshotPath}`)
  console.log(`FOUNDER PROFILE SCREENSHOT: ${browserResult.founderScreenshotPath}`)
} catch (error) {
  console.error(error)
  if (serverLog) console.error(serverLog)
  if (browserLog) console.error(browserLog)
  process.exitCode = 1
}
