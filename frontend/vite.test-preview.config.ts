import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createSyntheticPreviewProxyGuard } from './test-preview-proxy.mjs'

function syntheticPreviewProxyGuard(): Plugin {
  return {
    name: 'synthetic-test-preview-proxy-guard',
    configureServer(server) {
      const origin = process.env.TEST_PREVIEW_ORIGIN
      if (!origin) throw new Error('The synthetic preview requires its exact public origin.')
      server.middlewares.use(createSyntheticPreviewProxyGuard({ origin }))
    }
  }
}

const webOrigin = process.env.TEST_PREVIEW_ORIGIN
const apiKey = process.env.TEST_PREVIEW_API_KEY
const apiPort = Number(process.env.TEST_PREVIEW_API_PORT ?? 4199)
if (!webOrigin || !apiKey || apiKey.length < 32 || !Number.isInteger(apiPort)) {
  throw new Error('The synthetic preview requires its exact origin and an internally generated proxy key.')
}
const allowedHost = new URL(webOrigin).hostname

export default defineConfig({
  plugins: [syntheticPreviewProxyGuard(), react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.TEST_PREVIEW_WEB_PORT ?? 4173),
    strictPort: true,
    hmr: false,
    cors: false,
    allowedHosts: [allowedHost, 'localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
        configure(proxy) {
          proxy.on('proxyReq', proxyReq => {
            // Do not trust client-supplied forwarding or access-key headers at this public edge.
            for (const header of ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'x-test-preview-key']) {
              proxyReq.removeHeader(header)
            }
            proxyReq.setHeader('x-test-preview-key', apiKey)
          })
        }
      }
    }
  }
})
