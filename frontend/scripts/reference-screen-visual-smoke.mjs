import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const siteUrl = process.env.REFERENCE_QA_URL ?? process.env.TEST_PREVIEW_URL ?? 'http://localhost:4173/test'
const baseUrl = new URL(siteUrl)
const origin = baseUrl.origin
const chromium = process.env.CHROMIUM_PATH ?? 'chromium'
const outputDir = path.resolve(process.env.REFERENCE_QA_OUTPUT ?? 'test-artifacts/reference-qa')

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
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 12_000)
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
const profileDir = await mkdtemp(path.join(os.tmpdir(), 'aarambh-reference-qa-'))
const browser = spawn(chromium, [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--ignore-certificate-errors',
  `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${baseUrl.hostname}, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })
let client
const manifest = []

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function waitFor(test, description, timeoutMs = 15_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try { if (await test()) return } catch { /* keep waiting for the route to mount */ }
    await delay(150)
  }
  throw new Error(`Timed out waiting for ${description}`)
}
async function clickButtonContaining(text, root = 'body') {
  const clicked = await evaluate(`(() => { const root = document.querySelector(${JSON.stringify(root)}); const button = [...(root?.querySelectorAll('button') ?? [])].find(item => item.textContent.includes(${JSON.stringify(text)})); if (!button) return false; button.click(); return true })()`)
  assert.equal(clicked, true, `Expected a button containing “${text}” in ${root}`)
}
async function navigate(route) {
  const url = new URL(route, siteUrl).href
  await client.send('Page.navigate', { url })
  await waitFor(() => evaluate(`location.pathname === ${JSON.stringify(new URL(url).pathname)} && Boolean(document.querySelector('.test-sidebar'))`), `route ${route}`)
  await evaluate('window.scrollTo(0, 0)')
  await delay(700)
  await evaluate('document.fonts?.ready')
}
async function capture(page) {
  await navigate(page.route)
  const state = await evaluate(`(() => ({
    pathname: location.pathname,
    title: document.querySelector('h1')?.innerText.trim() ?? '',
    bodyCharacters: document.body.innerText.length,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    shellPresent: Boolean(document.querySelector('.test-sidebar')),
    viewport: { width: innerWidth, height: innerHeight },
  }))()`)
  assert.equal(state.shellPresent, true, `Page ${page.id} should render the interactive shell`)
  assert.equal(state.horizontalOverflow, false, `Page ${page.id} should not overflow the desktop viewport`)
  if (page.expectedTitle) assert.equal(state.title, page.expectedTitle, `Page ${page.id} should match its reference heading`)
  const image = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const filename = `page-${String(page.id).padStart(2, '0')}-${page.slug}.png`
  await writeFile(path.join(outputDir, filename), Buffer.from(image.data, 'base64'))
  manifest.push({ ...page, filename, ...state })
  console.log(`Captured page ${String(page.id).padStart(2, '0')}: ${page.name} — ${state.title || '(no h1)'}`)
}

try {
  await mkdir(outputDir, { recursive: true })
  const targets = await (async () => {
    const started = Date.now()
    while (Date.now() - started < 15_000) {
      try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
        if (response.ok) return await response.json()
      } catch { /* wait for Chromium DevTools */ }
      await delay(150)
    }
    throw new Error('Chromium DevTools did not start')
  })()
  const pageTarget = targets.find(target => target.type === 'page')
  assert.ok(pageTarget?.webSocketDebuggerUrl, 'Chromium must expose a page target')
  client = new CdpClient(pageTarget.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Network.enable')
  await client.send('Network.setExtraHTTPHeaders', { headers: { 'ngrok-skip-browser-warning': 'true' } })
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false })

  await navigate('/test/account')
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-form-card"))'), 'synthetic account sign-in form')
  const signInImage = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path.join(outputDir, 'page-17-account-login.png'), Buffer.from(signInImage.data, 'base64'))
  const signInState = await evaluate('({pathname:location.pathname,title:document.querySelector("h1")?.innerText.trim() ?? "",bodyCharacters:document.body.innerText.length,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,shellPresent:Boolean(document.querySelector(".test-sidebar")),viewport:{width:innerWidth,height:innerHeight}})')
  assert.equal(signInState.horizontalOverflow, false, 'Sign-in screen should fit the desktop viewport')
  assert.equal(signInState.title, 'Welcome back', 'Sign-in screen should use the reference welcome heading')
  manifest.push({ id: 17, slug: 'account-login', name: 'Sign in', filename: 'page-17-account-login.png', ...signInState })
  await clickButtonContaining('Register synthetic account', '.test-form-card')
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-form-card input[type=email]"))'), 'synthetic account sign-up form')
  const signUpImage = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path.join(outputDir, 'page-18-account-signup.png'), Buffer.from(signUpImage.data, 'base64'))
  const signUpState = await evaluate('({pathname:location.pathname,title:document.querySelector("h1")?.innerText.trim() ?? "",bodyCharacters:document.body.innerText.length,horizontalOverflow:document.documentElement.scrollWidth>innerWidth,shellPresent:Boolean(document.querySelector(".test-sidebar")),viewport:{width:innerWidth,height:innerHeight}})')
  assert.equal(signUpState.horizontalOverflow, false, 'Sign-up screen should fit the desktop viewport')
  assert.equal(signUpState.title, 'Join the Aarambh community', 'Sign-up screen should use the reference community heading')
  manifest.push({ id: 18, slug: 'account-signup', name: 'Create account', filename: 'page-18-account-signup.png', ...signUpState })

  await navigate('/test/account')
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-seed-accounts"))'), 'synthetic seed account controls')
  await clickButtonContaining('Founder account', '.test-seed-accounts')
  const loginSubmitted = await evaluate('(() => { const button=document.querySelector(".test-form-card button[type=submit]"); if(!button)return false; button.click(); return true })()')
  assert.equal(loginSubmitted, true, 'founder synthetic sign-in should be available for protected preview pages')
  await waitFor(() => evaluate('document.querySelector(".test-sidebar-account")?.textContent.includes("Rhea Sample")'), 'founder synthetic session')

  const pages = [
    { id: 1, slug: 'home', name: 'Home', route: '/test' },
    { id: 2, slug: 'community', name: 'Community', route: '/test/samples/community' },
    { id: 3, slug: 'launch-calendar', name: 'Launch calendar', route: '/test/samples/launch-calendar' },
    { id: 4, slug: 'state-examples', name: 'Analytics state examples', route: '/test/samples/analytics' },
    { id: 5, slug: 'notifications', name: 'Notifications', route: '/test/samples/notifications' },
    { id: 6, slug: 'business-editor', name: 'Business profile editor', route: '/test/business-profile' },
    { id: 7, slug: 'founder-editor', name: 'Founder profile editor', route: '/test/founder-profile' },
    { id: 8, slug: 'launch-detail', name: 'Launch detail', route: '/test/launch/sample-release-notes' },
    { id: 9, slug: 'founder-profile', name: 'Founder public profile', route: '/test/founder/mira-shah-synthetic-founder' },
    { id: 10, slug: 'business-profile-miti', name: 'Business profile · Miti Studio', route: '/test/brand/miti-studio' },
    { id: 11, slug: 'following', name: 'Following feed', route: '/test/following' },
    { id: 12, slug: 'collections', name: 'Collections', route: '/test/collections' },
    { id: 13, slug: 'business-profile-orbit', name: 'Business profile · Sample Orbit Labs', route: '/test/brand/sample-orbit-labs' },
    { id: 14, slug: 'upcoming', name: 'Upcoming calendar', route: '/test/upcoming' },
    { id: 15, slug: 'trending', name: 'Trending', route: '/test/samples/trending', expectedTitle: 'What the community is noticing' },
    { id: 16, slug: 'founder-dashboard', name: 'Founder dashboard', route: '/test/dashboard' },
    { id: 19, slug: 'founder-workspace', name: 'Founder workspace', route: '/test/workspace' },
    { id: 20, slug: 'leaderboard', name: 'Community leaderboard', route: '/test/leaderboard' },
    { id: 21, slug: 'business-discovery', name: 'Business discovery', route: '/test/nearby' },
  ]
  for (const page of pages) await capture(page)
  manifest.sort((left, right) => left.id - right.id)
  await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify({ siteOrigin: origin, viewport: { width: 1366, height: 900 }, pages: manifest }, null, 2)}\n`)
  assert.equal(manifest.length, 21, 'all 21 reference screens should have a screenshot')
  console.log(`PASS: captured ${manifest.length} reference pages to ${outputDir}`)
} finally {
  client?.close()
  const browserExited = new Promise(resolve => browser.once('exit', resolve))
  browser.kill('SIGTERM')
  await Promise.race([browserExited, delay(5_000)])
  await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 125 })
}
