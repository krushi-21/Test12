import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const cwd = path.resolve(import.meta.dirname, '..')
const chromium = process.env.CHROMIUM_PATH || 'chromium'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const reservedPorts = new Set()

async function freePort() {
  while (true) {
    const server = createServer()
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
    const port = server.address().port
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    if (!reservedPorts.has(port)) { reservedPorts.add(port); return port }
  }
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
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
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

let vite
let browser
let client
let profile
async function waitFor(check, description, attempts = 100) {
  let last
  for (let index = 0; index < attempts; index += 1) {
    try { last = await check(); if (last) return last } catch (error) { last = error }
    await delay(150)
  }
  const pageText = await evaluate('document.body?.innerText.slice(0, 1800)').catch(() => '')
  const reviewText = await evaluate('document.querySelector(".test-reviews-section")?.innerText').catch(() => '')
  throw new Error(`Timed out waiting for ${description}${last instanceof Error ? `: ${last.message}` : ''}${pageText ? `\nPage: ${pageText}` : ''}${reviewText ? `\nReview section: ${reviewText}` : ''}`)
}
async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function clickButton(text, selector = 'body') {
  const result = await evaluate(`(() => { const root = document.querySelector(${JSON.stringify(selector)}); const button = [...(root?.querySelectorAll('button') ?? [])].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!button) return false; button.click(); return true })()`)
  assert.equal(result, true, `Expected button “${text}” in ${selector}`)
}
async function clickLink(text, selector = 'body') {
  const result = await evaluate(`(() => { const root = document.querySelector(${JSON.stringify(selector)}); const link = [...(root?.querySelectorAll('a') ?? [])].find(item => item.textContent.trim() === ${JSON.stringify(text)}); if (!link) return false; link.click(); return true })()`)
  assert.equal(result, true, `Expected link “${text}” in ${selector}`)
}
async function setValue(selector, value) {
  const result = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  assert.equal(result, true, `Expected form control ${selector}`)
}
async function requested(path, method, bodyCheck) {
  return evaluate(`window.__communityQaRequests?.some(item => item.path === ${JSON.stringify(path)} && item.method === ${JSON.stringify(method)}${bodyCheck ? ` && ${bodyCheck}` : ''})`)
}
async function openPreviewCase(origin, testCase, selector) {
  await client.send('Page.navigate', { url: `${origin}/test/community-ui-harness.html?case=${encodeURIComponent(testCase)}` })
  await waitFor(() => evaluate(`Boolean(window.__communityQaReady && document.querySelector(${JSON.stringify(selector)}))`), `${testCase} UI`)
}
async function stopProcess(child) {
  if (!child) return
  const exited = child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise(resolve => child.once('exit', resolve))
  try { process.kill(-child.pid, 'SIGTERM') } catch { if (!child.killed) child.kill('SIGTERM') }
  await Promise.race([exited, delay(2000)])
  try { process.kill(-child.pid, 'SIGKILL') } catch { /* the process group may already be gone */ }
  await Promise.race([exited, delay(2000)])
}

try {
  const vitePort = await freePort()
  const debugPort = await freePort()
  vite = spawn(process.execPath, [path.join(cwd, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd, stdio: 'ignore', detached: true })
  const origin = `http://127.0.0.1:${vitePort}`
  await waitFor(async () => { try { return (await fetch(`${origin}/test/community-ui-harness.html`)).ok } catch { return false } }, 'Vite test harness')
  profile = await mkdtemp(path.join(os.tmpdir(), 'community-ui-test-'))
  browser = spawn(chromium, [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote',
    '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check',
    '--disable-component-update', '--disable-default-apps', '--disable-extensions', '--disable-domain-reliability',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore', detached: true })
  await waitFor(async () => { try { const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`); return response.ok ? response.json() : false } catch { return false } }, 'Chromium DevTools')
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
  const target = targets.find(item => item.type === 'page')
  assert.ok(target?.webSocketDebuggerUrl)
  client = new CdpClient(target.webSocketDebuggerUrl)
  await client.ready
  await client.send('Runtime.enable')
  await client.send('Page.enable')
  await client.send('Page.navigate', { url: `${origin}/test/community-ui-harness.html` })
  await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=community-ui-test-ready]") && window.__communityQaReady && document.querySelector(".community-category-row"))'), 'mounted community UI')

  const bookmarkStates = [
    ['signed-out', 'Business bookmarks are not supported yet. Signing in will not enable this feature.'],
    ['unverified', 'Business bookmarks are not supported yet. Email verification will not enable this feature.'],
    ['verified', 'Business bookmarks are not supported yet for any account; verification does not enable them.'],
  ]
  for (const [state, expectedMessage] of bookmarkStates) {
    await client.send('Page.navigate', { url: `${origin}/test/community-ui-harness.html?bookmarkState=${state}` })
    await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=community-ui-test-ready]") && window.__communityQaReady && document.querySelector(".community-category-row"))'), `${state} community profile`)
    await clickButton('About', '.community-page')
    await waitFor(() => evaluate('Boolean(document.querySelector(".community-business-bookmark-status"))'), `${state} business bookmark status`)
    assert.equal(await evaluate('document.querySelector(".community-business-bookmark-status")?.innerText'), expectedMessage, `${state} users must get accurate, non-enabling bookmark guidance`)
    assert.equal(await evaluate('Boolean(document.querySelector(".community-business-bookmark-button")?.disabled)'), true, `${state} business bookmark control must remain unavailable`)
    assert.equal(await evaluate('(() => { const button = document.querySelector(".community-business-bookmark-button"); return button?.getAttribute("aria-describedby") === document.querySelector(".community-business-bookmark-status")?.id && document.querySelector(".community-business-bookmark-status")?.getAttribute("role") === "status" })()'), true, `${state} bookmark explanation must be programmatically associated and announced`)
    await evaluate('document.querySelector(".community-business-bookmark-button")?.click()')
    assert.equal(await evaluate('window.__communityQaRequests.some(item => item.method !== "GET")'), false, `${state} bookmark UI must not send a write request`)
    assert.equal(await evaluate('window.__communityQaRequests.some(item => /\\/(?:launches|brands)\\/[^/]+\\/save$/.test(item.path))'), false, `${state} business UI must not call a save endpoint for launches or brands`)
  }

  await client.send('Page.navigate', { url: `${origin}/test/community-ui-harness.html` })
  await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=community-ui-test-ready]") && window.__communityQaReady && document.querySelector(".community-category-row"))'), 'default verified community UI')

  assert.equal(await evaluate('document.querySelector(".community-category-row button[aria-label=\\"Unfollow Synthetic Art category\\"]")?.getAttribute("aria-pressed")'), 'true', 'initial category follow state should come from GET /me/follows')
  await clickButton('Follow', '.community-category-row:last-child')
  await waitFor(() => evaluate('document.querySelector(".community-category-row:last-child button")?.getAttribute("aria-pressed") === "true"'), 'category follow state update')
  assert.equal(await requested('/api/me/follows/category/category-food', 'PUT'), true, 'category follow must use the actual API category id')
  assert.equal(await evaluate('window.__communityQaRequests.find(item => item.path === "/api/me/follows/category/category-food")?.credentials'), 'include', 'follow requests must include session cookies')

  assert.equal(await evaluate('document.querySelectorAll(".test-review-report").length'), 1, 'own reviews must not show a report form')
  assert.equal(await evaluate('document.querySelector(".test-rating-list li:first-child .test-review-report") === null'), true, 'the signed-in user must not be able to report their own review')
  await clickButton('Report review', '.test-review-report')
  await waitFor(() => requested('/api/reviews/review-other/report', 'POST'), 'review report request')
  assert.equal(await evaluate('window.__communityQaRequests.find(item => item.path === "/api/reviews/review-other/report")?.body?.reason'), 'misleading', 'review report should submit the selected reason')
  await waitFor(() => evaluate('document.body.innerText.includes("Report accepted for moderator review.")'), 'review report confirmation')

  assert.equal(await evaluate('[...document.querySelectorAll(".test-collection-card h2")].find(item => item.innerText.includes("Private synthetic collection"))?.querySelector("a") === null'), true, 'private collection title must be plain text')
  assert.equal(await evaluate('[...document.querySelectorAll(".test-collection-card h2")].find(item => item.innerText.includes("Public but tokenless collection"))?.querySelector("a") === null'), true, 'public tokenless collection title must be plain text')
  assert.equal(await evaluate('[...document.querySelectorAll(".test-collection-card h2")].find(item => item.innerText.includes("Public synthetic collection"))?.querySelector("a")?.getAttribute("href")'), '/test/collection/synthetic-share-token', 'public collection titles with a share URL should remain linked')
  assert.equal(await evaluate('document.querySelector(".test-collection-card h2 a[href$=\\"undefined\\"]") === null'), true, 'no collection title may link to an undefined route')
  await waitFor(() => evaluate('document.querySelectorAll(".test-public-collection-card").length === 2'), 'public collection gallery')
  assert.equal(await requested('/api/collections/public?limit=12', 'GET'), true, 'the public collection gallery should use the public collections endpoint')
  assert.equal(await evaluate('[...document.querySelectorAll(".test-public-collection-card")].find(card => card.innerText.includes("Public synthetic collection"))?.querySelector("h3 a")?.getAttribute("href")'), '/test/collection/synthetic-share-token', 'public gallery items with share tokens should link to their share route')
  assert.equal(await evaluate('[...document.querySelectorAll(".test-public-collection-card")].find(card => card.innerText.includes("without share token"))?.querySelector("h3 a") === null'), true, 'tokenless public collections must not get an invalid share link')

  await evaluate('document.querySelector(".community-moderation-card").open = true')
  await clickButton('Load queues', '.community-moderation-card')
  await waitFor(() => evaluate('document.body.innerText.includes("Synthetic Launch Report") && document.body.innerText.includes("Review · 2/5")'), 'both moderator queues')
  await setValue('#community-reason-synthetic-content-report', 'Synthetic moderator test reason.')
  await clickButton('Apply action', '.community-report-item')
  await waitFor(() => requested('/api/admin/reports/synthetic-content-report/actions', 'POST'), 'content moderation action')
  assert.equal(await evaluate('window.__communityQaRequests.find(item => item.path === "/api/admin/reports/synthetic-content-report/actions")?.body?.reason'), 'Synthetic moderator test reason.', 'content actions must include the required moderator reason')
  await clickButton('Hide review', '.community-moderation-card')
  await waitFor(() => requested('/api/admin/reviews/review-flagged/actions', 'POST'), 'review moderation action')
  assert.equal(await evaluate('window.__communityQaRequests.find(item => item.path === "/api/admin/reviews/review-flagged/actions")?.body?.action'), 'hide', 'review moderation should post the selected action')

  for (const state of ['signed-out', 'unverified']) {
    await openPreviewCase(origin, `discovery-${state}`, '[data-testid="business-save-control-synthetic-save-target"]')
    assert.equal(await evaluate('document.querySelector(".test-business-save-control button") === null'), true, `${state} discovery users must not receive a write control`)
    assert.equal(await evaluate('window.__communityQaRequests.some(item => item.method === "PUT" || item.method === "DELETE")'), false, `${state} discovery users must not send save writes`)
    await openPreviewCase(origin, `brand-${state}`, '[data-testid="brand-save-control"]')
    assert.equal(await evaluate('document.querySelector("[data-testid=brand-save-control] button") === null'), true, `${state} profile users must not receive a write control`)
    assert.equal(await evaluate('window.__communityQaRequests.some(item => item.method === "PUT" || item.method === "DELETE")'), false, `${state} profile users must not send save writes`)
  }

  await openPreviewCase(origin, 'discovery-member', '[data-testid="business-save-control-synthetic-save-target"]')
  assert.equal(await evaluate('document.querySelector("[data-testid=business-save-control-synthetic-save-target] button")?.getAttribute("aria-pressed")'), 'false', 'discovery initial isSaved must reflect the API payload')
  assert.equal(await evaluate('document.querySelector("[data-testid=business-save-count-synthetic-save-target]")?.innerText'), '7 saves', 'discovery initial saveCount must reflect the API payload')
  await evaluate('(() => { const button = document.querySelector("[data-testid=business-save-control-synthetic-save-target] button"); button.click(); button.click(); return true })()')
  await waitFor(() => evaluate('document.querySelector("[data-testid=business-save-control-synthetic-save-target] button")?.getAttribute("aria-pressed") === "true"'), 'discovery save success')
  assert.equal(await evaluate('document.querySelector("[data-testid=business-save-count-synthetic-save-target]")?.innerText'), '8 saves', 'successful discovery save must increment the displayed count')
  assert.equal(await evaluate('window.__communityQaRequests.filter(item => item.path === "/api/businesses/synthetic-save-target/save" && item.method === "PUT").length'), 1, 'rapid duplicate discovery clicks must produce one PUT')
  assert.equal(await evaluate('window.__communityQaRequests.filter(item => /owner[-/]?notices?|notifications/i.test(item.path)).length'), 0, 'the client must not duplicate the backend owner-notice side effect with a separate request')
  assert.equal(await evaluate('window.__communityQaRequests.find(item => item.path === "/api/businesses/synthetic-save-target/save" && item.method === "PUT")?.body'), undefined, 'business saves must send no body')
  assert.equal(await evaluate('window.__communityQaRequests.find(item => item.path === "/api/businesses/synthetic-save-target/save" && item.method === "PUT")?.credentials'), 'include', 'business save requests must include the session cookie')
  await clickButton('Remove saved business', '[data-testid="business-save-control-synthetic-save-target"]')
  await waitFor(() => evaluate('document.querySelector("[data-testid=business-save-control-synthetic-save-target] button")?.getAttribute("aria-pressed") === "false"'), 'discovery unsave success')
  assert.equal(await requested('/api/businesses/synthetic-save-target/save', 'DELETE'), true, 'discovery unsave must use the documented DELETE route')
  assert.equal(await evaluate('document.querySelector("[data-testid=business-save-count-synthetic-save-target]")?.innerText'), '7 saves', 'successful discovery unsave must decrement the displayed count')

  await openPreviewCase(origin, 'brand-member', '[data-testid="brand-save-control"]')
  assert.equal(await evaluate('document.querySelector("[data-testid=brand-save-control] button")?.getAttribute("aria-pressed")'), 'false', 'profile initial isSaved must reflect the API payload')
  assert.equal(await evaluate('document.querySelector("[data-testid=brand-save-count]")?.innerText'), '7 saves', 'profile initial saveCount must reflect the API payload')
  await evaluate('(() => { const button = document.querySelector("[data-testid=brand-save-control] button"); button.click(); button.click(); return true })()')
  await waitFor(() => evaluate('document.querySelector("[data-testid=brand-save-control] button")?.getAttribute("aria-pressed") === "true"'), 'profile save success')
  assert.equal(await evaluate('document.querySelector("[data-testid=brand-save-count]")?.innerText'), '8 saves', 'successful profile save must increment the displayed count')
  await clickButton('Remove saved business', '[data-testid="brand-save-control"]')
  await waitFor(() => evaluate('document.querySelector("[data-testid=brand-save-control] button")?.getAttribute("aria-pressed") === "false"'), 'profile unsave success')
  assert.equal(await evaluate('window.__communityQaRequests.filter(item => item.path === "/api/businesses/synthetic-save-target/save" && item.method === "PUT").length'), 1, 'profile save must issue one PUT')
  assert.equal(await evaluate('window.__communityQaRequests.filter(item => item.path === "/api/businesses/synthetic-save-target/save" && item.method === "DELETE").length'), 1, 'profile unsave must issue one DELETE')

  await openPreviewCase(origin, 'brand-owner', '[data-testid="brand-save-owner"]')
  assert.equal(await evaluate('document.querySelector("[data-testid=brand-save-control] button") === null'), true, 'profile owners must not be offered a save control')
  assert.equal(await evaluate('window.__communityQaRequests.some(item => item.method === "PUT" || item.method === "DELETE")'), false, 'profile owners must not send save writes')

  await openPreviewCase(origin, 'discovery-self-save-403', '[data-testid="business-save-control-synthetic-save-target"]')
  await clickButton('Save business', '[data-testid="business-save-control-synthetic-save-target"]')
  await waitFor(() => evaluate('document.querySelector("[data-testid=business-save-notice-synthetic-save-target]")?.innerText.includes("own business")'), 'discovery self-save rejection')
  assert.equal(await evaluate('document.querySelector("[data-testid=business-save-control-synthetic-save-target] button")?.getAttribute("aria-pressed")'), 'false', 'self-save 403 must not optimistically mark the business saved')
  assert.equal(await evaluate('document.querySelector("[data-testid=business-save-count-synthetic-save-target]")?.innerText'), '7 saves', 'self-save 403 must not optimistically increment saveCount')
  assert.equal(await evaluate('document.querySelector("[data-testid=business-save-notice-synthetic-save-target]")?.innerText.includes("Business saved")'), false, 'self-save 403 must not show a success notice')

  await openPreviewCase(origin, 'saved-empty', '[data-testid="saved-businesses-empty"]')
  assert.equal(await evaluate('document.querySelectorAll("[data-testid=saved-business-card]").length'), 0, 'empty saved-business response should show no business cards')
  assert.equal(await requested('/api/me/saved-businesses?limit=20', 'GET'), true, 'saved list must load its first page with limit=20')
  assert.equal(await evaluate('document.querySelector("[data-testid=saved-businesses-load-more]") === null'), true, 'empty saved list must not show pagination')

  await openPreviewCase(origin, 'saved-populated', '[data-testid="saved-businesses-list"]')
  assert.equal(await evaluate('document.querySelectorAll("[data-testid=saved-business-card]").length'), 2, 'saved list should render the first page')
  await clickButton('Load more saved businesses')
  await waitFor(() => evaluate('document.querySelectorAll("[data-testid=saved-business-card]").length === 3'), 'saved-business cursor page')
  assert.equal(await requested('/api/me/saved-businesses?limit=20&cursor=opaque%3Anext%2Fpage-2', 'GET'), true, 'pagination must pass the opaque cursor unchanged through URL encoding')
  assert.equal(await evaluate('document.querySelector("[data-testid=saved-business-card][data-business-slug=synthetic-three] a")?.getAttribute("href")'), '/test/brand/synthetic-three', 'saved businesses must link back to their public profile')

  await openPreviewCase(origin, 'for-you-loading', '[data-testid="for-you-page"]')
  await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=for-you-loading]") && window.__communityQaRequests.some(item => item.path === "/api/for-you?limit=20"))'), 'For You loading state and distinct endpoint request')
  assert.equal(await evaluate('document.querySelector("[data-testid=for-you-loading]")?.innerText'), 'Loading recommendations…', 'For You should announce its initial loading state')
  assert.equal(await evaluate('window.__communityQaRequests.find(item => item.path === "/api/for-you?limit=20")?.cache'), 'no-store', 'For You reads should explicitly bypass browser caching')
  assert.equal(await evaluate('window.__communityQaRequests.find(item => item.path === "/api/for-you?limit=20")?.credentials'), 'include', 'For You should send an optional session cookie when one exists')
  await evaluate('window.__communityQaReleaseForYouLoading()')
  await waitFor(() => evaluate('document.querySelector("[data-testid=for-you-item]")?.getAttribute("data-launch-id") === "for-you-loading-launch"'), 'For You loading response')

  await openPreviewCase(origin, 'for-you-populated', '[data-testid="for-you-page"]')
  await waitFor(() => evaluate('Boolean(document.querySelectorAll("[data-testid=for-you-item]").length === 1 && document.querySelector("[data-testid=for-you-ranking]"))'), 'ranked For You results')
  assert.equal(await evaluate('document.querySelector("[data-testid=for-you-ranking]")?.innerText.includes("Personalized recommendations")'), true, 'personalized ranking metadata should be visible')
  assert.equal(await evaluate('document.querySelector("[data-testid=for-you-recommendation-reason]")?.innerText.includes("Near your selected location")'), true, 'each launch should show the backend recommendation reason')
  assert.equal(await evaluate('window.__communityQaRequests.filter(item => item.path.startsWith("/api/for-you?")).every(item => item.method === "GET")'), true, 'For You feed reads must not issue impression or engagement writes')
  assert.equal(await evaluate('document.querySelector("[data-testid=for-you-item] .test-feature-launch-card a")?.getAttribute("href")?.includes("source=for-you")'), true, 'For You launch links should retain their distinct source attribution')
  await clickButton('Load more recommendations', '.test-for-you-page')
  await waitFor(() => evaluate('document.querySelectorAll("[data-testid=for-you-item]").length === 2'), 'For You opaque cursor page')
  assert.equal(await requested('/api/for-you?limit=20&cursor=opaque%3Anext%2Fpage-2', 'GET'), true, 'For You should pass the opaque nextCursor back to its own endpoint')
  await setValue('#for-you-city', 'Jaipur')
  await setValue('#for-you-state', 'Rajasthan')
  await setValue('#for-you-category', 'category-art')
  await clickButton('Apply filters', '.test-for-you-page')
  await waitFor(() => requested('/api/for-you?limit=20&city=Jaipur&state=Rajasthan&category=category-art', 'GET'), 'For You location and active-category filters')
  await waitFor(() => evaluate('document.querySelectorAll("[data-testid=for-you-item]").length === 1'), 'filtered For You first page')
  assert.equal(await evaluate('window.__communityQaRequests.some(item => item.path.startsWith("/api/me/following"))'), false, 'For You must not call or reuse the Following endpoint')

  await openPreviewCase(origin, 'for-you-empty', '[data-testid="for-you-page"]')
  await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=for-you-empty]"))'), 'empty For You response')
  assert.equal(await evaluate('document.querySelectorAll("[data-testid=for-you-item]").length'), 0, 'an empty HTTP 200 response should render no launch cards')
  assert.equal(await evaluate('document.querySelector("[data-testid=for-you-ranking]")?.innerText.includes("Popular & recent")'), true, 'cold-start responses should be labeled Popular & recent')
  assert.equal(await evaluate('document.querySelector("[data-testid=for-you-error]") === null'), true, 'an empty response is not an error')

  await openPreviewCase(origin, 'for-you-error', '[data-testid="for-you-page"]')
  await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=for-you-error]"))'), 'For You error state')
  assert.equal(await evaluate('document.querySelector("[data-testid=for-you-error]")?.innerText.includes("temporarily unavailable")'), true, 'the server error message should be announced')
  const errorRequestCount = await evaluate('window.__communityQaRequests.filter(item => item.path.startsWith("/api/for-you?")).length')
  await clickButton('Try again', '.test-for-you-page')
  await waitFor(() => evaluate(`window.__communityQaRequests.filter(item => item.path.startsWith("/api/for-you?")).length > ${errorRequestCount}`), 'For You retry request')

  await openPreviewCase(origin, 'for-you-signed-out', '[data-testid="for-you-page"]')
  await waitFor(() => evaluate('document.querySelector("[data-testid=for-you-item]")?.getAttribute("data-launch-id") === "for-you-anonymous-launch"'), 'signed-out For You results')
  assert.equal(await requested('/api/for-you?limit=20', 'GET'), true, 'signed-out viewers must request the optional-auth For You endpoint')
  assert.equal(await evaluate('window.__communityQaRequests.some(item => item.path === "/api/me" || item.path.startsWith("/api/me/following"))'), false, 'For You should not require a session or Following request')
  assert.equal(await evaluate('document.querySelector("[data-testid=for-you-ranking]")?.innerText.includes("Popular & recent")'), true, 'signed-out cold-start recommendations should render normally')

  await openPreviewCase(origin, 'following-regression', '.test-feature-launch-card')
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-feature-launch-card") && window.__communityQaRequests.some(item => item.path === "/api/me/following"))'), 'existing Following feed regression check')
  assert.equal(await evaluate('document.querySelector(".test-feature-launch-card h2")?.innerText'), 'Synthetic Following Launch', 'Following should continue rendering its original API-backed launch cards')
  assert.equal(await requested('/api/me/following', 'GET'), true, 'Following should retain its original endpoint')
  assert.equal(await evaluate('window.__communityQaRequests.some(item => item.path.startsWith("/api/for-you"))'), false, 'the Following route must remain separate from For You')

  await openPreviewCase(origin, 'feed-switch-for-you', '[data-testid="feed-mode-switch"]')
  assert.equal(await evaluate('document.querySelector("[data-testid=feed-mode-for-you]")?.getAttribute("aria-current")'), 'page', 'For You should mark its selected feed mode')
  assert.equal(await evaluate('document.querySelector("[data-testid=feed-mode-following]")?.getAttribute("href")'), '/test/following', 'For You should link directly to Following')
  await clickLink('Following', '[data-testid="feed-mode-switch"]')
  await waitFor(() => evaluate('document.querySelector(".test-page-heading h1")?.textContent === "Following"'), 'switch from For You to Following')
  assert.equal(await evaluate('document.querySelector("[data-testid=feed-mode-following]")?.getAttribute("aria-current")'), 'page', 'Following should mark its selected feed mode')
  assert.equal(await requested('/api/me/following', 'GET'), true, 'switching to Following should use its original endpoint')
  const forYouRequestCount = await evaluate('window.__communityQaRequests.filter(item => item.path.startsWith("/api/for-you?")).length')
  await clickLink('For You', '[data-testid="feed-mode-switch"]')
  await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=for-you-page]") && document.querySelector("[data-testid=feed-mode-for-you]")?.getAttribute("aria-current") === "page")'), 'switch from Following to For You')
  await waitFor(() => evaluate(`window.__communityQaRequests.filter(item => item.path.startsWith("/api/for-you?")).length > ${forYouRequestCount}`), 'For You refresh after returning from Following')
  assert.equal(await evaluate('window.__communityQaRequests.some(item => item.path.startsWith("/api/me/following"))'), true, 'switch navigation should leave Following API-backed')

  await openPreviewCase(origin, 'feed-switch-following', '[data-testid="feed-mode-switch"]')
  assert.equal(await evaluate('document.querySelector("[data-testid=feed-mode-following]")?.getAttribute("aria-current")'), 'page', 'direct Following entry should mark its selected feed mode')
  await clickLink('For You', '[data-testid="feed-mode-switch"]')
  await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=for-you-page]") && document.querySelector("[data-testid=feed-mode-for-you]")?.getAttribute("aria-current") === "page")'), 'direct Following to For You switch')
  assert.equal(await requested('/api/for-you?limit=20', 'GET'), true, 'switching from Following should load the distinct For You endpoint')

  await openPreviewCase(origin, 'collection-share', '.test-collection-share-hero')
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-collection-share-hero h1")?.innerText === "Public synthetic collection" && document.querySelectorAll(".test-feature-launch-card").length === 1)'), 'p13 public share hero and launch card')
  assert.equal(await evaluate('document.querySelector(".test-collection-share-hero .test-collection-share-meta")?.innerText.includes("1 launch")'), true, 'the public share hero should show its launch count')
  assert.equal(await evaluate('document.querySelector(".test-collection-share-hero img")?.alt'), 'Synthetic craft image', 'the public share hero should use the first launch image with its accessible description')

  await openPreviewCase(origin, 'community-hub', '[data-testid="community-hub-page"]')
  await waitFor(() => evaluate('document.querySelectorAll(".community-hub-person").length === 4 && document.querySelectorAll(".community-hub-story").length === 3'), 'p2 community hub sections')
  assert.equal(await evaluate('document.querySelector(".community-hub-heading h1")?.innerText'), 'Community', 'the community sample route should render its map-matched public hub title')
  assert.equal(await evaluate('Boolean(document.querySelector(".community-hub-conversation") && document.querySelector(".community-hub-prompt") && !document.querySelector(".community-profile-hero"))'), true, 'the public community route should show conversations and prompts instead of a founder profile')
  assert.equal(await evaluate('Boolean(document.querySelector("[data-testid=community-moderation-panel]"))'), true, 'the public Community hub should expose the moderator queue panel')
  await evaluate('document.querySelector("[data-testid=community-moderation-panel]").open = true')
  await waitFor(() => evaluate('Boolean(document.querySelector("[data-testid=community-moderation-panel] button"))'), 'moderator queue controls on Community hub')
  await clickButton('Load queues', '[data-testid="community-moderation-panel"]')
  await waitFor(() => requested('/api/admin/reports?status=open', 'GET') && requested('/api/admin/reviews/reports', 'GET'), 'both protected moderator queues from Community hub')
  assert.equal(await evaluate('document.querySelector("[data-testid=community-moderation-panel]")?.innerText.includes("Synthetic Launch Report")'), true, 'Community hub should render the loaded content queue item')
  await setValue('#community-reason-synthetic-content-report', 'Synthetic moderator test reason on Community hub.')
  await clickButton('Apply action', '[data-testid="community-moderation-panel"]')
  await waitFor(() => requested('/api/admin/reports/synthetic-content-report/actions', 'POST'), 'Community hub moderation action')
  await clickButton('Hide review', '[data-testid="community-moderation-panel"]')
  await waitFor(() => requested('/api/admin/reviews/review-flagged/actions', 'POST'), 'Community hub review moderation action')

  console.log('Community and business-save UI tests passed: p2 community hub, p12 public collection links, p13 share hero, permissions, For You loading/ranking/reasons/filters/paging/empty/error/retry/signed-out, plus the Following endpoint and cards.')
} finally {
  client?.close()
  await stopProcess(browser)
  await stopProcess(vite)
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
}
