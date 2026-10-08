import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const siteUrl = process.env.TEST_PREVIEW_URL ?? 'http://localhost:4973/test/founder/mira-shah-synthetic-founder'
const origin = new URL(siteUrl).origin
const chromium = process.env.CHROMIUM_PATH || 'chromium'
const outputDirectory = path.resolve(process.env.FOUNDER_PROFILE_SCREENSHOT_DIR ?? 'test-artifacts/founder-profile')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
  const port = server.address().port
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
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
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
        else pending.resolve(message.result)
      } else {
        this.events.push(message)
      }
    })
  }

  async send(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 15_000)
      this.pending.set(id, {
        method,
        resolve: value => { clearTimeout(timer); resolve(value) },
        reject: error => { clearTimeout(timer); reject(error) }
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() { this.socket.close() }
}

const debugPort = await freePort()
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'founder-profile-smoke-'))
const browser = spawn(chromium, [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote',
  '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check',
  '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--disable-domain-reliability',
  `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${new URL(origin).hostname}, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
  '--ignore-certificate-errors', '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDirectory}`, 'about:blank'
], { stdio: 'ignore' })
let client

async function waitForBrowser() {
  const started = Date.now()
  while (Date.now() - started < 20_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      if (response.ok) return
    } catch { /* Chromium is still starting. */ }
    await delay(100)
  }
  throw new Error('Chromium DevTools did not start.')
}

async function evaluate(expression) {
  try {
    const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  } catch (error) {
    throw new Error(`Runtime.evaluate failed for ${expression}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function waitFor(expression, description, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(150)
  }
  const pageText = await evaluate('document.body?.innerText.slice(0, 1600)').catch(() => '')
  throw new Error(`Timed out waiting for ${description}${pageText ? `\nPage: ${pageText}` : ''}`)
}

async function navigate(url, { width, height, mobile }) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await client.send('Page.navigate', { url })
}

async function captureScreenshot(filePath, viewportWidth) {
  await evaluate('document.fonts?.ready.then(() => true)')
  const pageHeight = await evaluate('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)')
  const screenshot = await client.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: viewportWidth, height: pageHeight, scale: 1 }
  })
  await writeFile(filePath, Buffer.from(screenshot.data, 'base64'))
}

try {
  await waitForBrowser()
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
  const target = targets.find(item => item.type === 'page')
  assert.ok(target?.webSocketDebuggerUrl, 'Chromium page target should be available')
  client = new CdpClient(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Network.enable')

  await navigate(siteUrl, { width: 1440, height: 1000, mobile: false })
  await waitFor('document.querySelector(".home-founder-launch-card")?.textContent.includes("Miti Studio") && document.querySelector(".home-founder-collection-card")?.textContent.includes("Miti Studio Community Picks")', 'API-backed Mira founder profile')

  assert.equal(await evaluate('document.querySelector(".home-founder-intro h1")?.textContent.trim()'), 'Mira Shah')
  assert.equal(await evaluate('document.querySelector(".home-founder-location")?.innerText.trim()'), 'Founder · Ahmedabad, Gujarat')
  assert.equal(await evaluate('document.querySelector(".home-founder-bio")?.textContent.trim()'), 'Mira designs with local artisans to create contemporary home pieces rooted in craft, function and story.')
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".home-founder-section h2")].map(item => item.textContent.trim())'), ['Selected launches', 'Saved collections'])
  assert.equal(await evaluate('document.querySelector("#founder-current-heading")?.textContent.trim()'), 'Current business')
  assert.equal(await evaluate('document.querySelectorAll(".home-founder-launch-card").length'), 3, 'Mira should show only her three published launches')
  assert.equal(await evaluate('document.querySelectorAll(".home-founder-collection-card").length'), 1, 'unrelated public collections must be filtered out')
  assert.equal(await evaluate('document.querySelector(".home-founder-collection-card")?.querySelector(".home-founder-collection-name")?.textContent.trim()'), 'Miti Studio Community Picks')
  assert.equal(await evaluate('document.querySelector(".home-founder-collection-card")?.querySelector(".home-founder-collection-copy > span")?.textContent.trim()'), '3 related launches')
  assert.equal(await evaluate('[...document.querySelectorAll(".home-founder-business-link")].some(link => link.textContent.includes("View business profile"))'), true)
  assert.equal(await evaluate('[...document.querySelectorAll(".home-founder-guest-follow a")].some(link => link.textContent.trim() === "Follow")'), true)
  assert.equal(await evaluate('[...document.querySelectorAll(".home-founder-guest-follow a")].some(link => link.textContent.trim() === "Sign in to follow this founder." && link.getAttribute("href") === "/test/account")'), true)
  assert.equal(await evaluate('[...document.querySelectorAll(".home-founder-collection-card a")].some(link => link.getAttribute("href")?.startsWith("/test/collection/"))'), true, 'collection should link to its public share URL')
  assert.equal(await evaluate('/512 followers|verified member/i.test(document.querySelector(".home-founder-page")?.innerText ?? "")'), false, 'unbacked follower counts and verification labels must not appear')
  const requestedPaths = client.events.filter(event => event.method === 'Network.requestWillBeSent').map(event => event.params.request.url)
  for (const endpoint of ['/api/founders/mira-shah-synthetic-founder', '/api/brands/miti-studio', '/api/launches?', '/api/collections/public?limit=50']) {
    assert.ok(requestedPaths.some(url => url.includes(endpoint)), `expected API request ${endpoint}`)
  }

  await mkdir(outputDirectory, { recursive: true })
  const desktopPath = path.join(outputDirectory, 'mira-founder-desktop.png')
  await captureScreenshot(desktopPath, 1440)

  await navigate(siteUrl, { width: 390, height: 844, mobile: true })
  await waitFor('document.querySelectorAll(".home-founder-launch-card").length === 3 && Boolean(document.querySelector(".home-founder-collection-card"))', 'responsive Mira profile')
  assert.equal(await evaluate('window.innerWidth'), 390, 'mobile viewport should be 390px wide')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".home-founder-section-grid")).gridTemplateColumns.split(" ").length'), 1, 'profile sections should stack on mobile')
  const mobilePath = path.join(outputDirectory, 'mira-founder-mobile.png')
  await captureScreenshot(mobilePath, 390)

  const rheaUrl = new URL('/test/founder/rhea-sample-test-founder', origin).href
  await navigate(rheaUrl, { width: 1440, height: 1000, mobile: false })
  await waitFor('document.querySelector(".home-founder-intro h1")?.textContent.trim() === "Rhea Sample"', 'preserved Rhea founder fixture')
  assert.equal(await evaluate('[...document.querySelectorAll(".home-founder-collection-name")].some(item => item.textContent.includes("Miti Studio Community Picks"))'), false, 'Mira’s collection must not leak into Rhea’s profile')

  console.log(JSON.stringify({
    status: 'passed',
    checks: ['Mira approved copy and role/location', 'Miti Studio business profile link', 'three founder-linked published launches', 'founder-filtered public collection with share URL', 'guest Follow sign-in state', 'no unbacked follower/verification claims', 'Rhea fixture remains accessible', 'mobile sections stack'],
    screenshots: [desktopPath, mobilePath]
  }, null, 2))
} finally {
  client?.close()
  browser.kill('SIGTERM')
  if (browser.exitCode === null) await new Promise(resolve => browser.once('exit', resolve))
  await rm(profileDirectory, { recursive: true, force: true })
}
