import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { runGeminiOcr } from './api/_gemini'

// Dev-only: serve POST /api/ocr with the SAME Gemini core the Vercel function
// uses, so `npm run dev` works without the Vercel CLI. Reads GEMINI_KEY from .env
// (note: not VITE_-prefixed, so it never reaches client code).
function devOcrApi(env: Record<string, string>): PluginOption {
  return {
    name: 'dev-ocr-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/ocr', (req, res, next) => {
        if (req.method !== 'POST') return next()
        if (!env.GEMINI_KEY) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'GEMINI_KEY not configured' }))
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json')
          try {
            const { imageBase64, mimeType } = JSON.parse(raw || '{}')
            const receipt = await runGeminiOcr({
              imageBase64,
              mimeType,
              apiKey: env.GEMINI_KEY,
              model: env.GEMINI_MODEL,
            })
            res.end(JSON.stringify(receipt))
          } catch (err) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: (err as Error).message }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      devOcrApi(env),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'SplitBill — snap, assign, split',
          short_name: 'SplitBill',
          description:
            'Snap a receipt, assign who-ordered-what, and split the bill. Cloud OCR (Gemini) with an on-device fallback.',
          theme_color: '#070b18',
          background_color: '#070b18',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          icons: [
            { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          // GLM-OCR ONNX weights + tokenizer are large; cache them on first use so
          // the offline fallback is instant afterwards. One-time download.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.host === 'huggingface.co' ||
                url.host === 'cdn-lfs.huggingface.co' ||
                url.host.endsWith('hf.co'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'hf-models',
                expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 60 },
                cacheableResponse: { statuses: [0, 200] },
                rangeRequests: true,
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
  }
})
