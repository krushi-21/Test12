import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const chromium = process.env.CHROMIUM_PATH || 'chromium'
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
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`))
      else pending.resolve(message.result)
    })
  }
  async send(method, params = {}) {
    await this.ready
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 12_000)
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

const vitePort = await freePort()
const debugPort = await freePort()
const origin = `http://127.0.0.1:${vitePort}`
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'editor-validation-smoke-'))
const viteBin = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')
let vite
let browser
let client

async function waitUntil(test, description, timeout = 20_000) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeout) {
    try {
      const result = await test()
      if (result) return result
    } catch (error) { lastError = error }
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${description}${lastError instanceof Error ? `: ${lastError.message}` : ''}`)
}

async function waitForBrowser() {
  await waitUntil(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      return response.ok
    } catch { return false }
  }, 'Chromium DevTools')
}

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitForExpression(expression, description) {
  await waitUntil(async () => evaluate(expression), description)
}

async function attachFile(selector, filePath) {
  const { root } = await client.send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector })
  assert.notEqual(nodeId, 0, `expected file input: ${selector}`)
  await client.send('DOM.setFileInputFiles', { files: [filePath], nodeId })
  await delay(60)
}

async function assertEditorResponsiveLayout() {
  for (const { width, editorColumns, asideColumns } of [
    { width: 1280, editorColumns: 2, asideColumns: 1 },
    { width: 768, editorColumns: 1, asideColumns: 2 },
    { width: 390, editorColumns: 1, asideColumns: 1 },
  ]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width <= 560 })
    const state = await evaluate(`(() => {
      const editor = document.querySelector('.test-profile-editor-layout')
      const aside = document.querySelector('.test-profile-editor-aside')
      const fields = document.querySelector('.test-profile-editor .test-form-grid')
      return {
        editorColumns: getComputedStyle(editor).gridTemplateColumns.split(/\\s+/u).length,
        asideColumns: getComputedStyle(aside).gridTemplateColumns.split(/\\s+/u).length,
        fieldColumns: getComputedStyle(fields).gridTemplateColumns.split(/\\s+/u).length,
        noOverflow: document.documentElement.scrollWidth <= innerWidth,
      }
    })()`)
    assert.equal(state.editorColumns, editorColumns, `${width}px editor layout should use the expected column count`)
    assert.equal(state.asideColumns, asideColumns, `${width}px preview/publish aside should use the expected column count`)
    if (width === 390) assert.equal(state.fieldColumns, 1, '390px editor fields should stack in one column')
    assert.equal(state.noOverflow, true, `${width}px editor should not overflow horizontally`)
  }
  await client.send('Emulation.clearDeviceMetricsOverride')
}

async function stopProcess(process) {
  if (!process || process.exitCode !== null) return
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 5000)
    process.once('exit', () => { clearTimeout(timer); resolve() })
    process.kill('SIGTERM')
  })
}

function fieldExpression(label, action) {
  return `(() => {
    const field = [...document.querySelectorAll('.test-profile-form label')].find(item => item.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)})
    const control = field?.querySelector('input, textarea')
    if (!control) return null
    ${action}
  })()`
}

async function setField(label, value) {
  const expression = fieldExpression(label, `
    const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)})
    control.dispatchEvent(new Event('input', { bubbles: true }))
    control.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  `)
  assert.equal(await evaluate(expression), true, `expected editable field: ${label}`)
  await delay(30)
}

async function getField(label, property) {
	  const action = property === 'validity' ? 'return { valid: control.validity.valid }' : `return control[${JSON.stringify(property)}]`
	  return evaluate(fieldExpression(label, action))
}

const mockApi = `(() => {
  const originalFetch = window.fetch.bind(window)
  window.__editorPatchRequests = []
  window.__editorPublishRequests = []
  window.__editorUploadRequests = []
  window.__holdEditorPatch = false
  window.__resolveEditorPatch = null
  const founderProfile = { id: 'founder-test', displayName: 'Test Founder', bio: 'Synthetic founder bio', city: 'Ahmedabad', state: 'Gujarat', role: 'Founder', publicProfile: true, publicBrandIds: ['business-test'] }
  const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
  window.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href)
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init)
    const method = String(init.method || 'GET').toUpperCase()
    if (url.pathname === '/api/me' && method === 'GET') return json({ user: { id: 'user-test', displayName: 'Test Member', email: 'member@example.invalid', emailVerified: true } })
    if (url.pathname === '/api/categories' && method === 'GET') return json({ categories: [{ id: 'category-test', name: 'Wellness', slug: 'wellness' }] })
    if (url.pathname === '/api/me/brands' && method === 'GET') return json({ items: [{ id: 'business-test', name: 'Test Business', logoUrl: '', description: 'A test business', category: 'category-test', city: '', area: '', address: '', latitude: null, longitude: null, businessMode: 'online', contactPhone: '', contactEmail: '', websiteUrl: '', whatsappUrl: '', quoteUrl: '', demoUrl: '', storeUrl: '', openingHours: {}, status: location.pathname === '/test/founder-profile' ? 'published' : 'draft' }] })
    if (url.pathname === '/api/me/founder-profile' && method === 'GET') return json({ item: founderProfile })
    if (url.pathname === '/api/uploads' && method === 'POST') {
      window.__editorUploadRequests.push({ purpose: init.body?.get?.('purpose') })
      return json({ asset: { id: 'asset-' + window.__editorUploadRequests.length, url: 'https://assets.example.invalid/profile-image.webp' } }, 201)
    }
    if (url.pathname === '/api/me/brands/business-test/publish' && method === 'POST') {
      window.__editorPublishRequests.push({ path: url.pathname, method })
      return json({ item: { id: 'business-test', name: 'Test Business', status: 'published' } })
    }
    if (method === 'PATCH') {
      const request = { path: url.pathname, body: String(init.body || '') }
      window.__editorPatchRequests.push(request)
      if (window.__holdEditorPatch) {
        window.__holdEditorPatch = false
        return new Promise(resolve => { window.__resolveEditorPatch = () => resolve(json({ item: founderProfile })) })
      }
      return json({ error: { message: 'Synthetic API validation error.' } }, 422)
    }
    return json({ error: { message: 'Unexpected mock API request.' } }, 404)
  }
})()`

try {
  vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: frontendRoot, stdio: 'ignore' })
  await waitUntil(async () => {
    try { return (await fetch(`${origin}/test/business-profile`)).ok }
    catch { return false }
  }, 'Vite frontend')

  browser = spawn(chromium, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote',
    '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-default-apps', '--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDirectory}`, 'about:blank'
  ], { stdio: 'ignore' })
  await waitForBrowser()
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
  const target = targets.find(item => item.type === 'page')
  assert.ok(target?.webSocketDebuggerUrl, 'Chromium should expose a page target')
  client = new CdpClient(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: mockApi })

  await client.send('Page.navigate', { url: `${origin}/test/business-profile` })
  await waitForExpression('Boolean(document.querySelector(".test-profile-form") && document.querySelector(".test-profile-form input[type=url]"))', 'business profile editor')
  assert.equal(await evaluate('Boolean(document.querySelector(".test-business-live-card") && [...document.querySelectorAll(".test-profile-form label")].some(label => label.querySelector("span")?.textContent.trim() === "Category"))'), true, 'business identity/category editor and live card should be present')
  assert.equal(await evaluate('Boolean(document.querySelector(".test-business-live-cover img") && document.querySelectorAll(".test-business-live-gallery img").length === 3)'), true, 'business cover and gallery images should appear in the live preview')
  assert.equal(await evaluate('document.querySelector(".test-business-verification-panel")?.innerText.includes("Badge design preview") && document.querySelector(".test-business-verification-panel")?.innerText.includes("cannot award a badge")'), true, 'business verification preview must be clearly illustrative, not an unsupported claim')
  assert.equal(await evaluate('[...document.querySelectorAll(".test-business-profile-form label")].some(label => label.textContent.includes("Cover image URL (preview only)")) && [...document.querySelectorAll(".test-business-profile-form label")].some(label => label.textContent.includes("Gallery image URLs"))'), true, 'cover and gallery editors should be available')
  await setField('Cover image URL (preview only)', 'https://assets.example.invalid/cover.webp')
  await setField('Gallery image URLs (one per line, preview only)', 'https://assets.example.invalid/gallery-one.webp\n/images/launch-textile.jpg')
  assert.equal(await evaluate('document.querySelector(".test-business-live-cover img")?.src.includes("assets.example.invalid/cover.webp") && document.querySelectorAll(".test-business-live-gallery img").length === 2'), true, 'editable media URLs should update the business preview')
  await assertEditorResponsiveLayout()
  await evaluate('document.querySelector(".test-profile-publish-panel button.test-button-secondary")?.click()')
	  await waitForExpression('Boolean(document.querySelector(".test-profile-modal[role=dialog]"))', 'business live preview dialog')
	  await evaluate('document.querySelector(".test-profile-modal button")?.click()')
	  await waitForExpression('!document.querySelector(".test-profile-modal")', 'business preview dialog close')
	  await attachFile('.test-business-profile-form input[aria-label="Choose business logo"]', path.join(frontendRoot, 'public/images/launch-craft.webp'))
	  await waitForExpression('window.__editorUploadRequests?.[0]?.purpose === "brand-logo"', 'business logo upload flow')
	  await waitForExpression('document.querySelector(".test-business-profile-form .test-profile-upload-row img")?.src.includes("assets.example.invalid/profile-image.webp")', 'uploaded business logo preview')
	  assert.equal(await evaluate('document.querySelector(".test-profile-publish-panel button.test-button-primary")?.disabled'), true, 'unsaved business edits should not be publishable')

  const businessTypes = await evaluate(`(() => Object.fromEntries(
    ['Latitude', 'Longitude', 'Public phone', 'Public contact email', 'Website (HTTPS)', 'WhatsApp link (HTTPS)', 'Request a quote (HTTPS)', 'Book a demo (HTTPS)', 'Visit store (HTTPS)'].map(label => {
      const field = [...document.querySelectorAll('.test-profile-form label')].find(item => item.querySelector('span')?.textContent.trim() === label)
      return [label, field?.querySelector('input')?.type]
    })
  ))()`)
  assert.deepEqual(businessTypes, {
    Latitude: 'number', Longitude: 'number', 'Public phone': 'tel', 'Public contact email': 'email',
    'Website (HTTPS)': 'url', 'WhatsApp link (HTTPS)': 'url', 'Request a quote (HTTPS)': 'url',
    'Book a demo (HTTPS)': 'url', 'Visit store (HTTPS)': 'url'
  })
  assert.equal(await evaluate('document.querySelector(".test-profile-form").checkValidity()'), true, 'all business contact/location fields must remain optional')
  assert.equal(await getField('Public phone', 'required'), false)
  assert.equal(await getField('Public phone', 'maxLength'), 25)
	  assert.equal(await getField('Latitude', 'min'), '-90')
	  assert.equal(await getField('Latitude', 'max'), '90')
	  assert.equal(await getField('Longitude', 'min'), '-180')
	  assert.equal(await getField('Longitude', 'max'), '180')
  assert.equal(await getField('Latitude', 'step'), 'any', 'fractional coordinates should be accepted')

  await setField('Website (HTTPS)', 'http://example.invalid')
  assert.equal(await getField('Website (HTTPS)', 'validity').then(validity => validity.valid), false, 'non-HTTPS URLs should be rejected')
  await setField('Website (HTTPS)', 'https://example.invalid')
  assert.equal(await getField('Website (HTTPS)', 'validity').then(validity => validity.valid), true, 'valid HTTPS URLs should pass')
  await setField('Website (HTTPS)', '')
  await setField('Public contact email', 'not-an-email')
  assert.equal(await getField('Public contact email', 'validity').then(validity => validity.valid), false, 'malformed email should be rejected')
  await setField('Public contact email', '')
  await setField('Public phone', '123-45')
	  assert.equal(await getField('Public phone', 'validity').then(validity => validity.valid), false, `phone should meet the API length/pattern (value=${await getField('Public phone', 'value')}, pattern=${await getField('Public phone', 'pattern')})`)
  await setField('Public phone', '+1 (234) 567-8901')
  assert.equal(await getField('Public phone', 'validity').then(validity => validity.valid), true, 'API-compatible phone should pass')
  await setField('Public phone', '')
  await setField('Latitude', '90.01')
  assert.equal(await getField('Latitude', 'validity').then(validity => validity.valid), false, 'latitude above 90 should be rejected')
  await setField('Latitude', '-90')
  assert.equal(await getField('Latitude', 'validity').then(validity => validity.valid), true)
  await setField('Latitude', '')
  await setField('Longitude', '-180.01')
  assert.equal(await getField('Longitude', 'validity').then(validity => validity.valid), false, 'longitude below -180 should be rejected')
  await setField('Longitude', '180')
  assert.equal(await getField('Longitude', 'validity').then(validity => validity.valid), true)
  await setField('Longitude', '')
  assert.equal(await evaluate('document.querySelector(".test-profile-form").checkValidity()'), true, 'empty optional values should still be valid')

  await evaluate('window.__holdEditorPatch = true; document.querySelector(".test-profile-form button[type=submit]")?.click()')
  await waitForExpression('window.__editorPatchRequests?.length === 1', 'business profile PATCH request')
  await waitForExpression('document.querySelector(".test-profile-form button[type=submit]").disabled', 'business editor busy state')
  const businessRequest = await evaluate('window.__editorPatchRequests[0]')
  assert.equal(businessRequest.path, '/api/me/brands/business-test')
  const businessPayload = JSON.parse(businessRequest.body).brand
  for (const key of ['coverImageUrl', 'galleryImageUrls']) assert.equal(Object.hasOwn(businessPayload, key), false, `${key} must not be sent to an API that does not support profile media`)
  for (const key of ['city', 'area', 'address', 'latitude', 'longitude', 'contactPhone', 'contactEmail', 'websiteUrl', 'whatsappUrl', 'quoteUrl', 'demoUrl', 'storeUrl']) {
    assert.equal(Object.hasOwn(businessPayload, key), false, `blank optional ${key} should stay omitted from the PATCH payload`)
  }
	  await evaluate('window.__resolveEditorPatch?.()')
	  await waitForExpression('document.querySelector(".test-profile-form button[type=submit]").disabled === false', 'business save to finish')
	  assert.equal(await evaluate('document.querySelector(".test-profile-publish-panel button.test-button-primary")?.disabled'), false, 'saving should enable the publish control')
  assert.match(await evaluate('document.querySelector(".test-profile-form [role=status]")?.textContent || ""'), /Business profile and weekly hours saved/u)

  await evaluate('document.querySelector(".test-profile-form button[type=submit]")?.click()')
  await waitForExpression('window.__editorPatchRequests?.length === 2', 'business validation-error request')
	  await waitForExpression('document.querySelector(".test-profile-form [role=status]")?.textContent.includes("Synthetic API validation error.")', 'business API error feedback')
	  assert.equal(await evaluate('document.querySelector(".test-profile-form button[type=submit]").disabled'), false, 'business editor should leave busy state after an error')
	  await evaluate('document.querySelector(".test-profile-publish-panel button.test-button-primary")?.click()')
	  await waitForExpression('window.__editorPublishRequests?.length === 1', 'business publish request')
	  assert.deepEqual(await evaluate('window.__editorPublishRequests[0]'), { path: '/api/me/brands/business-test/publish', method: 'POST' })
	  await waitForExpression('document.querySelector(".test-profile-publish-panel .test-profile-status")?.textContent.trim() === "published"', 'business published status')

  await client.send('Page.navigate', { url: `${origin}/test/founder-profile` })
  await waitForExpression('Boolean(document.querySelector(".test-profile-form textarea"))', 'founder profile editor')
  await waitForExpression('document.querySelector(".test-profile-form input")?.value === "Test Founder"', 'founder profile data')
  assert.equal(await evaluate('Boolean(document.querySelector(".test-founder-live-card") && document.querySelector(".test-founder-business-picker input:checked"))'), true, 'founder preview and supported linked-business selection should be present')
  assert.equal(await evaluate('[...document.querySelectorAll(".test-founder-profile-form label")].some(label => label.textContent.includes("Pronouns (preview only)")) && [...document.querySelectorAll(".test-founder-profile-form label")].some(label => label.textContent.includes("Interests (preview only)"))'), true, 'founder editor should expose pronouns and interests')
  assert.equal(await evaluate('document.querySelector(".test-founder-verification-panel")?.innerText.includes("Badge design preview") && document.querySelector(".test-founder-verification-panel")?.innerText.includes("cannot award a badge")'), true, 'founder verification preview must be clearly illustrative')
  await setField('Pronouns (preview only)', 'she/her')
  await setField('Interests (preview only)', 'Ceramics, slow design')
  assert.equal(await evaluate('document.querySelector(".test-founder-live-identity")?.innerText.includes("she/her") && document.querySelector(".test-founder-live-interests")?.innerText.includes("slow design")'), true, 'founder profile preview should reflect editable pronouns and interests')
  await assertEditorResponsiveLayout()
  await evaluate('[...document.querySelectorAll(".test-founder-profile-form .test-profile-form-actions button")].find(button => button.textContent.includes("Preview"))?.click()')
	  await waitForExpression('Boolean(document.querySelector(".test-profile-modal[role=dialog]"))', 'founder live preview dialog')
	  await evaluate('document.querySelector(".test-profile-modal button")?.click()')
	  await waitForExpression('!document.querySelector(".test-profile-modal")', 'founder preview dialog close')
	  await attachFile('.test-founder-profile-form input[aria-label="Choose founder portrait"]', path.join(frontendRoot, 'public/images/launch-craft.webp'))
	  await waitForExpression('window.__editorUploadRequests?.[0]?.purpose === "founder-avatar"', 'founder portrait upload flow')
  assert.equal(await getField('Display name', 'required'), true)
  assert.equal(await getField('Display name', 'maxLength'), 80)
  assert.equal(await getField('Short bio', 'maxLength'), 500)
  for (const label of ['City', 'State', 'Role']) {
    assert.equal(await getField(label, 'required'), false, `${label} should remain optional`)
    assert.equal(await getField(label, 'maxLength'), 80, `${label} should match the API limit`)
  }
  await setField('Display name', '')
  assert.equal(await getField('Display name', 'validity').then(validity => validity.valid), false, 'display name is required')
  assert.equal(await evaluate('document.querySelector(".test-profile-form button[type=submit]").disabled'), true, 'blank founder name disables save')
  await setField('Display name', 'X'.repeat(80))
  assert.equal(await evaluate('[...document.querySelectorAll(".test-profile-form label")].find(item => item.querySelector("span")?.textContent.trim() === "Display name")?.textContent.includes("80/80")'), true, 'display name character count should reflect the API limit')
  await setField('Display name', 'Test Founder')
  await setField('Short bio', 'B'.repeat(500))
  assert.equal(await evaluate('[...document.querySelectorAll(".test-profile-form label")].find(item => item.querySelector("span")?.textContent.trim() === "Short bio")?.textContent.includes("500/500")'), true, 'bio character count should reflect the API limit')

  const founderRequestIndex = await evaluate('window.__editorPatchRequests.length')
  await evaluate('window.__holdEditorPatch = true; document.querySelector(".test-profile-form button[type=submit]")?.click()')
  await waitForExpression(`window.__editorPatchRequests?.length === ${founderRequestIndex + 1}`, 'founder profile PATCH request')
  await waitForExpression('document.querySelector(".test-profile-form button[type=submit]").disabled && document.querySelector(".test-profile-form button[type=submit]").textContent.includes("Saving")', 'founder saving/disabled state')
  const founderRequest = await evaluate(`window.__editorPatchRequests[${founderRequestIndex}]`)
  assert.equal(founderRequest.path, '/api/me/founder-profile')
  assert.equal(JSON.parse(founderRequest.body).profile.displayName, 'Test Founder')
  assert.equal(JSON.parse(founderRequest.body).profile.avatarUrl, 'https://assets.example.invalid/profile-image.webp')
  assert.equal(Object.hasOwn(JSON.parse(founderRequest.body).profile, 'pronouns'), false, 'preview-only pronouns must not be sent to the unsupported API')
  assert.equal(Object.hasOwn(JSON.parse(founderRequest.body).profile, 'interests'), false, 'preview-only interests must not be sent to the unsupported API')
  assert.deepEqual(JSON.parse(founderRequest.body).profile.publicBrandIds, ['business-test'], 'only the supported public-brand IDs should be submitted')
  await evaluate('window.__resolveEditorPatch?.()')
  await waitForExpression('document.querySelector(".test-profile-form button[type=submit]").textContent.includes("Save founder profile")', 'founder save to finish')
  assert.match(await evaluate('document.querySelector(".test-profile-form [role=status]")?.textContent || ""'), /Founder profile updated/u)

  console.log('PASS: business validation/save/error feedback, upload flows, editable cover/gallery previews, non-claim verification previews, saved-state publishing, founder pronouns/interests preview, linked business, avatar, and busy state.')
} finally {
  client?.close()
  await Promise.all([stopProcess(browser), stopProcess(vite)])
  await rm(profileDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
