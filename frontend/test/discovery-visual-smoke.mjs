import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'

const url = process.env.TEST_PREVIEW_URL ?? 'http://localhost:4273/test/nearby'
const parsed = new URL(url)
const chromium = process.env.CHROMIUM_PATH ?? 'chromium'

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
  const port = server.address().port
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitFor(test, description, timeout = 15_000) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeout) {
    try {
      const result = await test()
      if (result) return result
    } catch (error) { lastError = error }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for ${description}${lastError instanceof Error ? `: ${lastError.message}` : ''}`)
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl)
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
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)) }, 8_000)
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.socket.close() }
}

const debugPort = await freePort()
const profile = await mkdtemp(path.join(os.tmpdir(), 'aarambh-discovery-visual-'))
const screenshotDir = process.env.DISCOVERY_SCREENSHOT_DIR
const browser = spawn(chromium, [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore' })
let client

async function evaluate(expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function saveScreenshot(filename) {
  if (!screenshotDir) return
  await mkdir(screenshotDir, { recursive: true })
  const image = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(path.join(screenshotDir, filename), Buffer.from(image.data, 'base64'))
}

try {
  const targets = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
    return response.ok ? response.json() : false
  }, 'Chromium DevTools')
  const page = targets.find(item => item.type === 'page')
  assert.ok(page?.webSocketDebuggerUrl)
  client = new CdpClient(page.webSocketDebuggerUrl)
  await client.ready
  await client.send('Page.enable')
  await client.send('Runtime.enable')
  await client.send('Network.enable')
  await client.send('Network.setBlockedURLs', { urls: ['*openstreetmap.org*'] })
  await client.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1080, deviceScaleFactor: 1, mobile: false })
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const originalFetch = window.fetch.bind(window)
    const businesses = [
      { id: 'map-business-a', slug: 'map-business-a', name: 'Sample Map Cafe', category: 'food-beverage', city: 'Ahmedabad', state: 'Gujarat', area: 'Navrangpura', address: 'Synthetic sample address', latitude: 23.0225, longitude: 72.5714, distanceKm: 0, businessMode: 'physical', openNow: true, verified: true, isFollowed: false, logoUrl: '/images/launch-home.jpg', links: {} },
      { id: 'map-business-b', slug: 'map-business-b', name: 'Sample Map Studio', category: 'arts-crafts', city: 'Ahmedabad', state: 'Gujarat', area: 'Law Garden', address: 'Synthetic sample address', latitude: 23.0302, longitude: 72.5706, distanceKm: 0.86, businessMode: 'hybrid', openNow: true, verified: true, isFollowed: false, links: {} },
      { id: 'map-business-missing', slug: 'map-business-missing', name: 'Sample Coordinates Missing', category: 'home-living', city: 'Ahmedabad', state: 'Gujarat', area: 'Old City', latitude: 23.04, longitude: null, distanceKm: 1.4, businessMode: 'physical', openNow: true, verified: false, isFollowed: false, logoUrl: '/images/missing-business-photo.jpg', links: {} }
    ]
    window.__discoveryMockItems = businesses
    window.__discoveryMockFullItems = businesses
    window.__discoveryMockDelayMs = 900
    window.__discoveryMockFailure = false
    window.__discoveryMockCalls = []
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      if (new URL(url, location.href).pathname === '/api/discover/businesses') {
        window.__discoveryMockCalls.push(url)
        if (window.__discoveryMockFailure) return Promise.reject(new Error('Synthetic discovery request failed'))
        const response = new Response(JSON.stringify({ items: window.__discoveryMockItems, nextCursor: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        return new Promise(resolve => setTimeout(() => resolve(response), window.__discoveryMockDelayMs))
      }
      return originalFetch(input, init)
    }
  })()` })
  await client.send('Page.navigate', { url: parsed.href })
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-discovery-filters"))'), 'nearby controls')
  await evaluate(` [...document.querySelectorAll('.test-action-row button')].find(button => button.textContent.trim() === 'Map view')?.click()`)
  await waitFor(() => evaluate('document.querySelector(".test-map-loading")?.textContent.trim()'), 'designer initial loading message')
  assert.equal(await evaluate('document.querySelector(".test-map-loading")?.textContent.trim()'), 'Finding makers near Ahmedabad…')
  await waitFor(() => evaluate('document.querySelectorAll(".test-business-card").length === 3'), 'mixed-coordinate businesses')
  await evaluate('document.querySelectorAll(".test-business-card-thumb img").forEach(image => { image.loading = "eager" })')
  await waitFor(() => evaluate('[...document.querySelectorAll(".test-business-card-thumb img")].length === 3 && [...document.querySelectorAll(".test-business-card-thumb img")].every(image => image.complete && image.naturalWidth > 0)'), 'business thumbnail fixtures and missing-image fallback')
  const thumbnails = await evaluate(`([...document.querySelectorAll('.test-business-card')].map(card => {
    const image = card.querySelector('.test-business-card-thumb img')
    return { name: card.querySelector('h2')?.innerText, alt: image?.alt, src: image ? new URL(image.currentSrc, location.href).pathname : '', loaded: Boolean(image?.complete && image.naturalWidth > 0) }
  }))`)
  assert.deepEqual(thumbnails.map(image => image.src), ['/images/launch-home.jpg', '/images/aarambh-home-hero.jpg', '/images/launch-saffron.jpg'], 'cards should prefer the supplied business logo and use existing category photos when absent or broken')
  assert.ok(thumbnails.every(image => image.loaded && image.alt === `${image.name} business photo`), 'each thumbnail should load and expose descriptive alt text')

  const desktop = await evaluate(`(() => {
    const section = document.querySelector('.test-feature-page:has(> .test-discovery-filters)')
    const title = document.querySelector('.test-page-heading h1')
    const filters = document.querySelector('.test-discovery-filters')
    const sidebar = document.querySelector('.test-sidebar')
    const menu = document.querySelector('.test-sidebar-menu')
    const nav = document.querySelector('.test-sidebar-nav')
    const navLink = document.querySelector('.test-sidebar-nav .test-nav-link')
    return {
      themeInk: getComputedStyle(section).getPropertyValue('--aarambh-ink').trim(),
      titleFont: getComputedStyle(title).fontFamily,
      titleText: title.textContent.trim(),
      descriptionText: document.querySelector('.test-page-heading p')?.textContent.trim(),
      filterRadius: getComputedStyle(filters).borderRadius,
      shellBackground: getComputedStyle(sidebar).backgroundColor,
      shellWordmark: getComputedStyle(document.querySelector('.test-wordmark')).color,
      navLinkColor: getComputedStyle(navLink).color,
      menuOpen: menu?.open,
      navVisible: Boolean(nav?.getClientRects().length),
      sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
      mapVisible: Boolean(document.querySelector('.test-map-panel')),
      defaultMarkerCount: document.querySelectorAll('.test-map-marker').length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth
    }
  })()`)
  assert.equal(desktop.themeInk, '#1b2642')
  assert.match(desktop.titleFont, /Georgia/u)
  assert.equal(desktop.titleText, 'Explore makers near you')
  assert.equal(desktop.descriptionText, 'Independent makers and small businesses around Ahmedabad.')
  assert.equal(desktop.filterRadius, '16px')
  assert.equal(desktop.shellBackground, 'rgb(27, 38, 66)')
  assert.equal(desktop.shellWordmark, 'rgb(247, 245, 239)')
  assert.equal(desktop.navLinkColor, 'rgb(247, 245, 239)')
  assert.equal(desktop.menuOpen, true, 'the persistent desktop sidebar should be open')
  assert.equal(desktop.navVisible, true, 'desktop route links should be visible without a menu toggle')
  assert.equal(desktop.sidebarWidth, 248, 'desktop routes should use the fixed-width shared sidebar')
  assert.equal(desktop.mapVisible, true, 'desktop discovery should open in split map/list mode by default')
  assert.equal(desktop.defaultMarkerCount, 2, 'the default desktop map should show only valid founder-coordinate pins')
  assert.equal(desktop.horizontalOverflow, false)
  if (screenshotDir) await saveScreenshot('discovery-first-viewport-desktop.png')

  await evaluate(` [...document.querySelectorAll('.test-action-row button')].find(button => button.textContent.trim() === 'List view')?.click()`)
  await waitFor(() => evaluate('!document.querySelector(".test-map-panel")'), 'switch to list-only view')
  const clickedMap = await evaluate(`(() => {
    const button = [...document.querySelectorAll('.test-action-row button')].find(item => item.textContent.trim() === 'Map view')
    if (!button) return false
    button.click()
    return true
  })()`)
  assert.equal(clickedMap, true)
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-map-panel"))'), 'map/list discovery layout')
  const desktopLayout = await evaluate(`(() => {
    const section = document.querySelector('.test-feature-page:has(> .test-map-panel)')
    return getComputedStyle(section).gridTemplateColumns.trim().split(/\\s+/u).length
  })()`)
  assert.equal(desktopLayout, 2, 'desktop map and results should sit side-by-side')
  const mapState = await evaluate(`(() => ({
    markers: [...document.querySelectorAll('.test-map-marker')].map(marker => {
      const label = marker.querySelector('.test-map-marker-label')
      const labelBounds = label?.getBoundingClientRect()
      const canvasBounds = marker.closest('.test-map-canvas')?.getBoundingClientRect()
      const legendBounds = marker.closest('.test-map-canvas')?.querySelector('.test-map-legend')?.getBoundingClientRect()
      const labelDoesNotOverlapLegend = Boolean(labelBounds && legendBounds && (labelBounds.right <= legendBounds.left || labelBounds.left >= legendBounds.right || labelBounds.bottom <= legendBounds.top || labelBounds.top >= legendBounds.bottom))
      return { id: marker.dataset.mapMarker, label: marker.getAttribute('aria-label'), businessLabel: label?.textContent.trim(), labelVisible: Boolean(label && getComputedStyle(label).display !== 'none' && getComputedStyle(label).visibility !== 'hidden'), labelWithinCanvas: Boolean(labelBounds && canvasBounds && labelBounds.left >= canvasBounds.left && labelBounds.right <= canvasBounds.right && labelBounds.top >= canvasBounds.top && labelBounds.bottom <= canvasBounds.bottom), labelDoesNotOverlapLegend, left: marker.style.left, top: marker.style.top }
    }),
    pinnedResults: document.querySelectorAll('.test-map-location-list button').length,
    mapLabel: document.querySelector('.test-map-grid > span')?.textContent.trim(),
    unlocatedText: document.querySelector('.test-map-unlocated')?.innerText ?? '',
    iframeCount: document.querySelectorAll('.test-map-panel iframe').length,
    radiusOptions: [...document.querySelector('[aria-label="Search radius in kilometres"]')?.options ?? []].map(option => option.value),
    overflow: document.documentElement.scrollWidth > innerWidth
  }))()`)
  assert.equal(mapState.markers.length, 2, 'each result with valid founder coordinates should get exactly one map pin')
  assert.deepEqual(mapState.markers.map(marker => marker.businessLabel), ['Sample Map Cafe', 'Sample Map Studio'], 'each pin should identify its corresponding business')
  assert.ok(mapState.markers.every(marker => marker.labelVisible && marker.labelWithinCanvas), 'business labels should remain visible and inside the map canvas')
  assert.ok(mapState.markers.every(marker => marker.labelDoesNotOverlapLegend), 'business labels should not overlap the map legend')
  assert.equal(mapState.pinnedResults, 2, 'the map legend/list should contain each and only each pinned result')
  assert.equal(mapState.mapLabel, 'Ahmedabad · selected area')
  assert.ok(mapState.markers.some(marker => marker.id === 'map-business-a' && marker.label.includes('23.02250, 72.57140')))
  assert.ok(mapState.markers.some(marker => marker.id === 'map-business-b' && marker.label.includes('23.03020, 72.57060')))
  assert.ok(mapState.markers.every(marker => marker.left.endsWith('%') && marker.top.endsWith('%')))
  assert.match(mapState.unlocatedText, /Sample Coordinates Missing[^]*Location not shared/u)
  assert.match(mapState.unlocatedText, /no location is guessed/iu)
  assert.equal(mapState.iframeCount, 0, 'the plotted map should not depend on a third-party map API')
  assert.deepEqual(mapState.radiusOptions, ['5', '10', '25', '50', '100'], 'distance radius choices remain available')
  assert.equal(mapState.overflow, false)

  await evaluate(`document.querySelector('[data-map-marker="map-business-b"]').click()`)
  await waitFor(() => evaluate('document.querySelector(".test-map-selected")?.innerText.includes("Sample Map Studio")'), 'marker selection details')
  assert.equal(await evaluate('document.querySelector("[data-map-marker=map-business-b]")?.getAttribute("aria-pressed")'), 'true')
  assert.equal(await evaluate('document.querySelector(".test-business-card.is-map-selected h2")?.innerText'), 'Sample Map Studio', 'selecting a pin should highlight its matching result')
  await evaluate(`document.querySelector('.test-map-unlocated button')?.click()`)
  await waitFor(() => evaluate('document.querySelector(".test-map-selected")?.innerText.includes("No marker is shown")'), 'missing-coordinate selection explanation')
  assert.equal(await evaluate('document.querySelectorAll(".test-map-marker").length'), 2, 'a result without coordinates must not get a guessed city-center pin')

  await evaluate(`window.__discoveryMockItems = []; [...document.querySelectorAll('.test-action-row button')].find(button => button.textContent.trim() === 'Search nearby').click()`)
  await waitFor(() => evaluate('document.querySelector(".test-map-empty")?.textContent.includes("No makers found")'), 'designer empty map message')
  assert.equal(await evaluate('document.querySelector(".test-map-empty")?.textContent.trim()'), 'No makers found in this area. Try a wider distance or choose another city.')
  await evaluate(`window.__discoveryMockFailure = true; [...document.querySelectorAll('.test-action-row button')].find(button => button.textContent.trim() === 'Search nearby').click()`)
  await waitFor(() => evaluate('document.querySelector(".test-map-error")?.textContent.includes("We couldn’t load the map.")'), 'designer map error message')
  assert.equal(await evaluate('document.querySelector(".test-map-error")?.querySelector("p")?.textContent.trim()'), 'We couldn’t load the map. Switch to list view or try again.')
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".test-map-error-actions button")].map(button => button.textContent.trim())'), ['List view', 'Try again'])
  await evaluate(`document.querySelector('.test-map-error-actions button')?.click()`)
  await waitFor(() => evaluate('!document.querySelector(".test-map-panel")'), 'switch to list view from map error')
  await evaluate(`window.__discoveryMockFailure = false; window.__discoveryMockDelayMs = 0; window.__discoveryMockItems = window.__discoveryMockFullItems; [...document.querySelectorAll('.test-action-row button')].find(button => button.textContent.trim() === 'Map view')?.click()`)
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-map-panel"))'), 'switch back to map view')
  await evaluate(`document.querySelector('.test-action-row button')?.click()`)
  await waitFor(() => evaluate('document.querySelectorAll(".test-business-card").length === 3 && document.querySelectorAll(".test-map-marker").length === 2'), 'map recovery after the empty/error states')
  if (screenshotDir) {
    await evaluate('(()=>{const panel=document.querySelector(".test-map-panel"); if(panel){panel.scrollIntoView({block:"start",behavior:"instant"}); window.scrollBy(0,-170)}})()')
    await saveScreenshot('discovery-map-desktop.png')
  }

  await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await waitFor(() => evaluate('innerWidth === 390'), 'mobile viewport')
  await client.send('Page.navigate', { url: parsed.href })
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-discovery-filters") && document.querySelectorAll(".test-business-card").length === 3)'), 'mobile discovery reload')
  await evaluate('window.scrollTo({ top: 0, behavior: "instant" })')
  await waitFor(() => evaluate('document.querySelector(".test-discovery-filter-toggle")?.getAttribute("aria-expanded") === "false"'), 'mobile filters to start collapsed')
  const mobile = await evaluate(`(() => {
    const section = document.querySelector('.test-feature-page:has(> .test-discovery-filters)')
    const toggle = document.querySelector('.test-discovery-filter-toggle')
    const filterGrid = document.querySelector('.test-discovery-filters')
    const searchButton = [...document.querySelectorAll('.test-action-row button')].find(button => button.textContent.trim() === 'Search nearby')
    const mapButton = [...document.querySelectorAll('.test-action-row button')].find(button => button.textContent.trim() === 'Map view')
    return { horizontalOverflow: document.documentElement.scrollWidth > innerWidth, mapVisible: Boolean(document.querySelector('.test-map-panel')), filterToggleVisible: getComputedStyle(toggle).display !== 'none', filtersCollapsed: toggle.getAttribute('aria-expanded') === 'false' && getComputedStyle(filterGrid).display === 'none', citySummary: toggle.querySelector('.test-discovery-filter-summary')?.textContent.trim(), actionBottom: Math.max(searchButton.getBoundingClientRect().bottom, mapButton.getBoundingClientRect().bottom), sectionWidth: section.getBoundingClientRect().width, menuClosed: !document.querySelector('.test-sidebar-menu')?.open, menuButtonVisible: getComputedStyle(document.querySelector('.test-sidebar-menu > summary')).display !== 'none' }
  })()`)
  assert.equal(mobile.horizontalOverflow, false, 'discovery should fit a 390px viewport')
  assert.equal(mobile.mapVisible, false, 'mobile discovery should start in the compact list view')
  assert.equal(mobile.filterToggleVisible, true, 'mobile should expose a visible Filters disclosure control')
  assert.equal(mobile.filtersCollapsed, true, 'mobile filters should start collapsed to keep results and map controls accessible')
  assert.equal(mobile.citySummary, 'Ahmedabad · 25 km radius', 'collapsed filter summary should preserve the current city and distance')
  assert.ok(mobile.actionBottom <= 844, 'mobile search and map controls should remain above the fold when filters are collapsed')
  assert.ok(mobile.sectionWidth <= 390, 'mobile results should fit within the viewport')
  assert.equal(mobile.menuClosed, true, 'mobile sidebar menu should start compact')
  assert.equal(mobile.menuButtonVisible, true, 'mobile sidebar should expose its compact menu control')
  if (screenshotDir) await saveScreenshot('discovery-first-viewport-mobile.png')
  await evaluate(`document.querySelector('.test-discovery-filter-toggle')?.click()`)
  await waitFor(() => evaluate('document.querySelector(".test-discovery-filter-toggle")?.getAttribute("aria-expanded") === "true"'), 'expand mobile filters')
  const expandedFilters = await evaluate(`(() => ({ columnCount: getComputedStyle(document.querySelector('.test-discovery-filters')).gridTemplateColumns.trim().split(/\\s+/u).length, radius: document.querySelector('[aria-label="Search radius in kilometres"]').value, city: document.querySelector('[aria-label="Filter by city"]').value, togglesVisible: getComputedStyle(document.querySelector('.test-filter-toggles')).display !== 'none' }))()`)
  assert.equal(expandedFilters.columnCount, 2, 'expanded filters should use two columns at 390px')
  assert.equal(expandedFilters.radius, '25')
  assert.equal(expandedFilters.city, 'Ahmedabad')
  assert.equal(expandedFilters.togglesVisible, true, 'expanded filters should expose the existing advanced toggles')
  await evaluate(`document.querySelector('.test-discovery-filter-toggle')?.click()`)
  await waitFor(() => evaluate('document.querySelector(".test-discovery-filter-toggle")?.getAttribute("aria-expanded") === "false"'), 'collapse mobile filters')
  await evaluate(` [...document.querySelectorAll('.test-action-row button')].find(button => button.textContent.trim() === 'Map view')?.click()`)
  await waitFor(() => evaluate('Boolean(document.querySelector(".test-map-panel"))'), 'open the mobile map view')
  const mobileMap = await evaluate(`(() => ({ columns: getComputedStyle(document.querySelector('.test-feature-page:has(> .test-map-panel)')).gridTemplateColumns.trim().split(/\\s+/u).length, markers: document.querySelectorAll('.test-map-marker').length, mapWidth: document.querySelector('.test-map-canvas')?.getBoundingClientRect().width, thumbnailWidths: [...document.querySelectorAll('.test-business-card-thumb')].map(photo => photo.getBoundingClientRect().width), overflow: document.documentElement.scrollWidth > innerWidth }))()`)
  assert.equal(mobileMap.columns, 1, 'mobile map and results should stack in one column')
  assert.equal(mobileMap.markers, 2, 'both founder-coordinate pins should remain usable on mobile')
  assert.ok(mobileMap.mapWidth > 0 && mobileMap.mapWidth <= 390, 'the mobile coordinate map should fit the viewport')
  assert.ok(mobileMap.thumbnailWidths.length === 3 && mobileMap.thumbnailWidths.every(width => width > 0 && width <= 64), '390px business thumbnails should remain compact and visible')
  assert.equal(mobileMap.overflow, false, 'the mobile map view should not cause horizontal overflow')
  await evaluate(`document.querySelector('.test-sidebar-menu > summary')?.click()`)
  assert.equal(await evaluate('document.querySelector(".test-sidebar-menu")?.open'), true, 'the compact mobile menu should reveal the route list')
  await evaluate(`document.querySelector('.test-sidebar-menu > summary')?.click()`)
  assert.equal(await evaluate('document.querySelector(".test-sidebar-menu")?.open'), false, 'the compact mobile menu should close after use')
  if (screenshotDir) {
    await evaluate('(()=>{const panel=document.querySelector(".test-map-panel"); if(panel){panel.scrollIntoView({block:"start",behavior:"instant"}); window.scrollBy(0,-170)}})()')
    await saveScreenshot('discovery-map-mobile.png')
  }
  await client.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 740, deviceScaleFactor: 1, mobile: true })
  await waitFor(() => evaluate('innerWidth === 320'), 'narrow mobile viewport')
  await evaluate(`document.querySelector('.test-discovery-filter-toggle')?.click()`)
  await waitFor(() => evaluate('document.querySelector(".test-discovery-filter-toggle")?.getAttribute("aria-expanded") === "true"'), 'expand narrow mobile filters')
  const narrowExpandedFilters = await evaluate(`(() => ({ columns: getComputedStyle(document.querySelector('.test-discovery-filters')).gridTemplateColumns.trim().split(/\\s+/u).length, city: document.querySelector('[aria-label="Filter by city"]').value, radius: document.querySelector('[aria-label="Search radius in kilometres"]').value }))()`)
  assert.equal(narrowExpandedFilters.columns, 1, 'expanded filters should use a single column at 320px')
  assert.equal(narrowExpandedFilters.city, 'Ahmedabad')
  assert.equal(narrowExpandedFilters.radius, '25')
  await evaluate(`document.querySelector('.test-discovery-filter-toggle')?.click()`)
  await waitFor(() => evaluate('document.querySelector(".test-discovery-filter-toggle")?.getAttribute("aria-expanded") === "false"'), 'collapse narrow mobile filters')
  const narrowMobile = await evaluate(`(() => ({ filterToggleVisible: getComputedStyle(document.querySelector('.test-discovery-filter-toggle')).display !== 'none', filtersCollapsed: document.querySelector('.test-discovery-filter-toggle').getAttribute('aria-expanded') === 'false', horizontalOverflow: document.documentElement.scrollWidth > innerWidth, mapWidth: document.querySelector('.test-map-canvas')?.getBoundingClientRect().width, thumbnailWidths: [...document.querySelectorAll('.test-business-card-thumb')].map(photo => photo.getBoundingClientRect().width) }))()`)
  assert.equal(narrowMobile.filterToggleVisible, true, 'a 320px viewport should retain its compact filter disclosure')
  assert.equal(narrowMobile.filtersCollapsed, true, 'filters should remain collapsed after switching to 320px')
  assert.equal(narrowMobile.horizontalOverflow, false, 'discovery should fit a 320px viewport')
  assert.ok(narrowMobile.mapWidth > 0 && narrowMobile.mapWidth <= 320, 'the coordinate plot should fit a 320px viewport')
  assert.ok(narrowMobile.thumbnailWidths.length === 3 && narrowMobile.thumbnailWidths.every(width => width > 0 && width <= 64), '320px business thumbnails should remain compact and visible')
  console.log('PASS: page-21 discovery copy and loading/empty/error states, accessible business photos and fallback, design tokens, navy shell, coordinate-verified pins, missing-location state, map/list selection, distance options, and desktop/390px/320px layouts.')
} finally {
  client?.close()
  browser.kill('SIGTERM')
  await new Promise(resolve => {
    if (browser.exitCode !== null) return resolve()
    browser.once('exit', resolve)
    setTimeout(resolve, 2_000).unref()
  })
  await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
}
