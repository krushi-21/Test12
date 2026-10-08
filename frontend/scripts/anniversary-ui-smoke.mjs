import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const siteUrl = process.env.TEST_PREVIEW_URL ?? 'http://127.0.0.1:4174/test/upcoming'
const origin = new URL(siteUrl).origin
const targetHost = new URL(siteUrl).hostname
const chromium = process.env.CHROMIUM_PATH || 'chromium'
if (!['127.0.0.1', 'localhost', '::1'].includes(targetHost)) {
  throw new Error('This smoke only runs against the local disposable synthetic preview.')
}

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
        if (message.error) pending.reject(new Error(message.error.message))
        else pending.resolve(message.result)
        return
      }
      this.events.push(message)
    })
  }
  async send(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 12_000)
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value) },
        reject: error => { clearTimeout(timer); reject(error) }
      })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.socket.close() }
}

const debugPort = await freePort()
const profile = await mkdtemp(path.join(os.tmpdir(), 'anniversary-ui-smoke-'))
const browserLog = []
const browser = spawn(chromium, [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote',
  '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check',
  '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--disable-domain-reliability',
  `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${targetHost}, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] })
browser.stderr.on('data', chunk => browserLog.push(chunk.toString()))
let client

async function waitFor(read, predicate, description, attempts = 100) {
  let last
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const value = await read()
      if (predicate(value)) return value
      last = value
    } catch (error) { last = error }
    await delay(150)
  }
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}`)
}

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function clickButton(text) {
  const clicked = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) return false; button.click(); return true })()`)
  assert.equal(clicked, true, `Expected button “${text}”`)
}

try {
  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
    return response.ok ? response.json() : false
  }, Boolean, 'Chromium DevTools')
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
  const target = targets.find(item => item.type === 'page')
  assert.ok(target?.webSocketDebuggerUrl)
  client = new CdpClient(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Network.enable')
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await client.send('Page.navigate', { url: `${origin}/test/upcoming` })
  await waitFor(() => evaluate('document.body.innerText.includes("Upcoming launches")'), Boolean, 'API-backed upcoming page')
  await clickButton('Anniversaries')

  const responseEvent = await waitFor(() => client.events.find(event => event.method === 'Network.responseReceived' && new URL(event.params.response.url).pathname === '/api/launches/anniversaries'), Boolean, 'GET /api/launches/anniversaries response')
  assert.equal(responseEvent.params.response.status, 200, 'the synthetic anniversary endpoint should return HTTP 200')
  const responseBody = await client.send('Network.getResponseBody', { requestId: responseEvent.params.requestId })
  const apiResult = JSON.parse(responseBody.body)
  assert.ok(Array.isArray(apiResult.items), 'the API should return an items array')
  assert.ok(apiResult.items.length > 0, 'the synthetic seed should populate at least one current-day anniversary')
  assert.ok(apiResult.items.some(item => item.slug === 'sample-release-notes'), 'the seeded sample launch should match today’s India-local anniversary date')

  await waitFor(() => evaluate(`(() => {
    const page = document.querySelector('.test-feature-page')
    const cards = [...(page?.querySelectorAll('.test-calendar-card') ?? [])]
    return page?.innerText.includes('Launch anniversaries') && cards.some(card => card.innerText.includes('A calmer way to share release notes')) && cards.some(card => card.querySelector('time[datetime]'))
  })()`), Boolean, 'populated anniversary cards and dates in the UI')
  const cardCount = await evaluate('document.querySelectorAll(".test-calendar-card").length')
  const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown')
  assert.equal(exceptions.length, 0, 'the anniversary page should not throw browser exceptions')
  console.log(`PASS: GET /api/launches/anniversaries returned ${apiResult.items.length} synthetic records; the mobile Upcoming page rendered ${cardCount} dated anniversary cards.`)
  console.log('PASS: the result includes the seeded synthetic “A calmer way to share release notes” launch; only the local in-memory preview was read.')
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
