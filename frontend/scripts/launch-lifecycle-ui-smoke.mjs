import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const siteUrl = process.env.TEST_PREVIEW_URL ?? 'http://127.0.0.1:4174/test/workspace'
const origin = new URL(siteUrl).origin
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
      if (message.method === 'Fetch.requestPaused') {
        const { requestId, request } = message.params
        const headers = Object.entries(request.headers ?? {})
          .filter(([name]) => name.toLowerCase() !== 'origin')
          .map(([name, value]) => ({ name, value }))
        headers.push({ name: 'Origin', value: previewOrigin })
        const pathname = new URL(request.url).pathname
        const delayOwnerLaunchList = request.method === 'GET' && (pathname === '/api/me/brands' || /^\/api\/me\/brands\/[^/]+\/launches$/u.test(pathname))
        const continueRequest = () => this.send('Fetch.continueRequest', { requestId, headers }).catch(error => {
          this.events.push({ method: 'Fetch.interceptionError', message: error.message })
        })
        if (delayOwnerLaunchList) void delay(900).then(continueRequest)
        else void continueRequest()
      }
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
const profile = await mkdtemp(path.join(os.tmpdir(), 'launch-lifecycle-ui-'))
const browserLog = []
const browser = spawn(chromium, [
  '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote',
  '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check',
  '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--disable-domain-reliability',
  `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${new URL(origin).hostname}, EXCLUDE localhost, EXCLUDE 127.0.0.1`,
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
  const notice = client ? await evaluate('document.querySelector(".test-notice-error")?.innerText ?? ""').catch(() => '') : ''
  const loginStatuses = client?.events.filter(event => event.method === 'Network.responseReceived' && new URL(event.params.response.url).pathname === '/api/auth/login').map(event => event.params.response.status) ?? []
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}${notice ? `; notice: ${notice}` : ''}${loginStatuses.length ? `; login HTTP status: ${loginStatuses.join(', ')}` : ''}`)
}

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function clickButton(text, rootSelector = 'body') {
  const clicked = await evaluate(`(() => { const root = document.querySelector(${JSON.stringify(rootSelector)}); const button = [...(root?.querySelectorAll('button') ?? [])].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) return false; button.click(); return true })()`)
  assert.equal(clicked, true, `Expected button “${text}” in ${rootSelector}`)
}

async function clickButtonContaining(text, rootSelector = 'body') {
  const clicked = await evaluate(`(() => { const root = document.querySelector(${JSON.stringify(rootSelector)}); const button = [...(root?.querySelectorAll('button') ?? [])].find(item => item.textContent.includes(${JSON.stringify(text)})); if (!button) return false; button.click(); return true })()`)
  assert.equal(clicked, true, `Expected a button containing “${text}” in ${rootSelector}`)
}

async function click(selector) {
  const clicked = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true })()`)
  assert.equal(clicked, true, `Expected a clickable element ${selector}`)
}

async function clickLaunchButton(title, text) {
  const clicked = await evaluate(`(() => { const row = [...document.querySelectorAll('.test-launch-manager-item')].find(item => item.innerText.includes(${JSON.stringify(title)})); const button = [...(row?.querySelectorAll('button') ?? [])].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) return false; button.click(); return true })()`)
  assert.equal(clicked, true, `Expected “${text}” on launch “${title}”`)
}

async function fill(selector, value) {
  const filled = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set; setter.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', {bubbles:true})); element.dispatchEvent(new Event('change', {bubbles:true})); return true })()`)
  assert.equal(filled, true, `Expected input ${selector}`)
}

async function waitForApiAction(method, pathname) {
  await waitFor(() => client.events.some(event => {
    if (event.method !== 'Network.requestWillBeSent') return false
    const request = event.params.request
    return request.method === method && new URL(request.url).pathname === pathname
  }), Boolean, `${method} ${pathname}`)
}

async function waitForApiResponse(pathname, status) {
  await waitFor(() => client.events.some(event => event.method === 'Network.responseReceived' &&
    new URL(event.params.response.url).pathname === pathname && event.params.response.status === status),
  Boolean, `${pathname} HTTP ${status}`)
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
  await client.send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/api*`, requestStage: 'Request' }] })
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await client.send('Page.navigate', { url: `${origin}/test/account` })
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-seed-accounts"))'), Boolean, 'synthetic account sign-in screen')
  await clickButtonContaining('Founder account', '.test-seed-accounts')
  await waitFor(() => evaluate(`document.querySelector('.test-form-card input[type="email"]')?.value === 'founder@synthetic.example.invalid' && Boolean(document.querySelector('.test-form-card input[type="password"]')?.value)`), Boolean, 'seeded founder credentials populated')
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-form-card button[type=submit]:not(:disabled)"))'), Boolean, 'synthetic sign-in form ready')
  await click('.test-form-card button[type="submit"]')
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-session-card"))'), Boolean, 'seeded synthetic founder session')

  await client.send('Page.navigate', { url: `${origin}/test/workspace` })
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-workspace-page"))'), Boolean, 'founder workspace')
  await waitFor(() => evaluate(`(() => {
    const page = document.querySelector('.test-workspace-page')
    const welcome = page?.querySelector('.test-workspace-welcome')
    const overview = page?.querySelector('.test-workspace-overview')
    const shortcuts = overview?.querySelector('.test-workspace-shortcuts')
    const recent = overview?.querySelector('[data-testid="workspace-recent-launches"]')
    const management = page?.querySelector('.test-workspace-management')
    return Boolean(welcome?.querySelector('h1')?.textContent.includes('Welcome back') && shortcuts?.querySelectorAll('.test-workspace-shortcut-group').length >= 4 && recent?.querySelector('h2')?.textContent.includes('Recent launches') && management && page.children[0] === welcome && page.children[1] === overview)
  })()`), Boolean, 'workspace welcome dashboard, shortcuts, recent activity and management hierarchy')
  await waitFor(() => evaluate(`(() => { const card = [...document.querySelectorAll('.test-workspace-card')].find(item => item.innerText.includes('Launches and drafts')); return card?.innerText.includes('Choose a brand above to load its launches.') && !card.innerText.includes('No launch records for this synthetic brand yet.') })()`), Boolean, 'no-brand prompt before brands finish loading')
  await waitFor(() => evaluate(`(() => { const card = [...document.querySelectorAll('.test-workspace-card')].find(item => item.innerText.includes('Launches and drafts')); return card?.innerText.includes('Loading launches for this brand…') && !card.innerText.includes('No launch records for this synthetic brand yet.') })()`), Boolean, 'launch loading state during delayed owner-brand request')
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-launch-manager-list"))'), Boolean, 'launch management list')
  const brandValue = await evaluate(`(() => { const card = [...document.querySelectorAll('.test-workspace-card')].find(item => item.innerText.includes('Launches and drafts')); const select = [...(card?.querySelectorAll('select') ?? [])].find(item => [...item.options].some(option => option.textContent.toLowerCase().includes('published'))); const option = [...(select?.options ?? [])].find(item => item.textContent.toLowerCase().includes('published')); return option?.value ?? '' })()`)
  assert.ok(brandValue, 'the seeded founder should have a published synthetic brand')
  const launchCardSelector = '.test-workspace-page .test-workspace-card:nth-of-type(3)'
  await fill(`${launchCardSelector} select`, brandValue)

  const emptyBrandName = `Workspace empty ${Date.now()}`
  await fill('.test-workspace-page input[maxlength="100"]', emptyBrandName)
  await clickButton('Create draft brand', '.test-workspace-page')
  await waitFor(() => evaluate(`(() => { const card = [...document.querySelectorAll('.test-workspace-card')].find(item => item.innerText.includes('Launches and drafts')); return [...(card?.querySelector('select')?.options ?? [])].some(option => option.textContent.includes(${JSON.stringify(emptyBrandName)})) })()`), Boolean, 'new empty synthetic brand in launch selector')
  const emptyBrandValue = await evaluate(`(() => { const card = [...document.querySelectorAll('.test-workspace-card')].find(item => item.innerText.includes('Launches and drafts')); return [...(card?.querySelector('select')?.options ?? [])].find(option => option.textContent.includes(${JSON.stringify(emptyBrandName)}))?.value ?? '' })()`)
  assert.ok(emptyBrandValue, 'the new synthetic brand should be selectable for empty-state verification')
  await fill(`${launchCardSelector} select`, emptyBrandValue)
  await waitFor(() => evaluate(`(() => { const card = [...document.querySelectorAll('.test-workspace-card')].find(item => item.innerText.includes('Launches and drafts')); return card?.innerText.includes('Loading launches for this brand…') && !card.innerText.includes('No launch records for this synthetic brand yet.') })()`), Boolean, 'empty-brand launch request remains in loading state')
  await waitForApiResponse(`/api/me/brands/${encodeURIComponent(emptyBrandValue)}/launches`, 200)
  await waitFor(() => evaluate(`(() => { const card = [...document.querySelectorAll('.test-workspace-card')].find(item => item.innerText.includes('Launches and drafts')); return card?.innerText.includes('No launch records for this synthetic brand yet.') })()`), Boolean, 'empty-state message after successful empty response')
  await fill(`${launchCardSelector} select`, brandValue)
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-launch-manager-list"))'), Boolean, 'return to the published synthetic brand')

  const stamp = Date.now()
  const initialTitle = `Lifecycle UI ${stamp}`
  const editedTitle = `${initialTitle} edited`
  await fill(`${launchCardSelector} input[maxlength="120"]`, initialTitle)
  await clickButton('Attach built-in synthetic launch image', launchCardSelector)
  await waitFor(() => evaluate('document.body.innerText.includes("sample launch image uploaded")'), Boolean, 'synthetic launch image upload')
  await clickButton('Create launch draft', launchCardSelector)
  await waitFor(() => evaluate(`[...document.querySelectorAll('.test-launch-manager-item')].some(item => item.innerText.includes(${JSON.stringify(initialTitle)}))`), Boolean, 'launch draft creation')
  await waitFor(() => evaluate(`document.querySelector('[data-testid="workspace-recent-launches"] .test-workspace-recent-item')?.innerText.includes(${JSON.stringify(initialTitle)})`), Boolean, 'new synthetic launch displayed in recent activity summary')
  await waitForApiAction('POST', '/api/me/brands/' + encodeURIComponent(brandValue) + '/launches')

  await clickLaunchButton(initialTitle, 'Edit draft')
  const launchId = await evaluate(`(() => [...document.querySelectorAll('.test-launch-manager-item')].find(item => item.innerText.includes(${JSON.stringify(initialTitle)}))?.getAttribute('data-launch-id') ?? '')()`)
  assert.ok(launchId, 'the launch list exposes the newly created launch id for API verification')
  await fill('.test-launch-edit-form input[aria-label="Edit launch title"]', editedTitle)
  await clickLaunchButton(initialTitle, 'Save launch draft')
  await waitFor(() => evaluate(`[...document.querySelectorAll('.test-launch-manager-item')].some(item => item.innerText.includes(${JSON.stringify(editedTitle)}))`), Boolean, 'edited launch title displayed after reload')
  await waitForApiAction('PATCH', `/api/me/launches/${encodeURIComponent(launchId)}`)
  await clickLaunchButton(editedTitle, 'Publish synthetic launch')
  await waitFor(() => evaluate(`document.querySelector('.test-launch-manager-item')?.innerText.includes('published')`), Boolean, 'launch publish state')
  await waitForApiAction('POST', `/api/me/launches/${encodeURIComponent(launchId)}/publish`)
  await clickLaunchButton(editedTitle, 'Pause launch')
  await waitFor(() => evaluate(`(() => { const row = [...document.querySelectorAll('.test-launch-manager-item')].find(item => item.innerText.includes(${JSON.stringify(editedTitle)})); return row?.innerText.includes('paused') && [...row.querySelectorAll('button')].some(button => button.textContent.trim() === 'Resume launch') })()`), Boolean, 'paused launch state and resume control')
  await waitForApiAction('POST', `/api/me/launches/${encodeURIComponent(launchId)}/pause`)
  await clickLaunchButton(editedTitle, 'Resume launch')
  await waitFor(() => evaluate(`(() => { const row = [...document.querySelectorAll('.test-launch-manager-item')].find(item => item.innerText.includes(${JSON.stringify(editedTitle)})); return row?.innerText.includes('published') && [...row.querySelectorAll('button')].some(button => button.textContent.trim() === 'Pause launch') })()`), Boolean, 'resumed launch state and pause control')
  await waitForApiAction('POST', `/api/me/launches/${encodeURIComponent(launchId)}/publish`)
  await clickLaunchButton(editedTitle, 'Archive launch')
  await waitFor(() => evaluate(`(() => { const row = [...document.querySelectorAll('.test-launch-manager-item')].find(item => item.innerText.includes(${JSON.stringify(editedTitle)})); return row?.innerText.includes('archived') && ![...(row?.querySelectorAll('button') ?? [])].some(button => /Edit draft|Pause launch|Resume launch|Archive launch/u.test(button.textContent)) })()`), Boolean, 'archived launch state with lifecycle controls removed')
  await waitForApiAction('POST', `/api/me/launches/${encodeURIComponent(launchId)}/archive`)

  const calendarUrl = `${origin}/test/samples/launch-calendar`
  await client.send('Page.navigate', { url: calendarUrl })
  await waitFor(() => evaluate('Boolean(document.querySelector(".growth-calendar-grid"))'), Boolean, 'live launch calendar')
  await waitFor(() => evaluate('Boolean(document.querySelector(".growth-calendar-cell.has-event"))'), Boolean, 'seeded upcoming launch date')
  await click('.growth-calendar-cell.has-event')
  await waitFor(() => evaluate('Boolean([...document.querySelectorAll(".growth-agenda-card")].some(card => card.innerText.includes("Sample upcoming launch")))'), Boolean, 'founder-owned upcoming launch in agenda')
  await waitFor(() => evaluate('Boolean(document.querySelector(".growth-agenda-card .growth-reminder-button"))'), Boolean, 'owner reminder state loaded')
  await clickButton('Remind me', '.growth-agenda')
  await waitFor(() => evaluate('document.querySelector(".growth-inline-error[role=alert]")?.innerText === "You can’t set a reminder for a launch you own."'), Boolean, 'owner-specific reminder denial copy')
  await waitFor(() => client.events.some(event => event.method === 'Network.responseReceived' && new URL(event.params.response.url).pathname === '/api/launches/sample-coming-soon/notify' && event.params.response.status === 403), Boolean, 'owner reminder 403 response')

  await client.send('Network.clearBrowserCookies')
  await client.send('Page.navigate', { url: calendarUrl })
  await waitFor(() => evaluate('Boolean(document.querySelector(".growth-calendar-grid"))'), Boolean, 'calendar after clearing synthetic session')
  await waitFor(() => evaluate('Boolean(document.querySelector(".growth-calendar-cell.has-event"))'), Boolean, 'upcoming launch after clearing synthetic session')
  await click('.growth-calendar-cell.has-event')
  await waitFor(() => evaluate('Boolean([...document.querySelectorAll(".growth-agenda-card")].some(card => card.innerText.includes("Sample upcoming launch")))'), Boolean, 'upcoming launch after sign-out')
  await waitFor(() => evaluate('Boolean(document.querySelector(".growth-agenda-card .growth-reminder-button"))'), Boolean, 'reminder state loaded after sign-out')
  await clickButton('Remind me', '.growth-agenda')
  await waitFor(() => evaluate('document.querySelector(".growth-inline-error[role=alert]")?.innerText === "Sign in to set or remove launch reminders."'), Boolean, 'unauthenticated reminder sign-in copy')
  await waitFor(() => client.events.some(event => event.method === 'Network.responseReceived' && new URL(event.params.response.url).pathname === '/api/launches/sample-coming-soon/notify' && event.params.response.status === 401), Boolean, 'unauthenticated reminder 401 response')

  const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown')
  assert.equal(exceptions.length, 0, 'the lifecycle UI should not throw browser exceptions')
  console.log('PASS: WorkspacePage distinguishes no brand, pending launch load, and a confirmed empty launch list.')
  console.log('PASS: isolated mobile-width browser flow edited, published, paused, resumed and archived a synthetic launch through the existing API.')
  console.log('PASS: the launch calendar distinguishes an owner-specific 403 denial from an unauthenticated 401 and displays the correct copy for each.')
  console.log(`PASS: launch ${editedTitle} remained in the in-memory preview only; all lifecycle actions were verified by UI state and API request.`)
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
