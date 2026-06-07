# Gemini OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gemini 3.5 Flash the primary receipt OCR (via a Vercel serverless proxy that holds the API key), keeping the existing on-device Donut as an offline/failure fallback.

**Architecture:** A thin server core (`api/_gemini.ts`) calls Gemini and returns structured JSON; it is reused by the Vercel function (`api/ocr.ts`), a Vite dev middleware (so `npm run dev` works with no Vercel CLI), and Node smoke scripts. The browser downscales the photo, POSTs it to `/api/ocr`, and a pure parser converts the decimal amounts to integer cents. `src/lib/ocr.ts` becomes an orchestrator: Gemini first when online, Donut on offline/failure.

**Tech Stack:** TypeScript · Vite · React · Vercel serverless functions · Gemini `generateContent` REST (JSON mode) · `tsx` (run TS Node scripts).

**Spec:** `docs/superpowers/specs/2026-06-07-gemini-ocr-design.md`

**Conventions for every task:** money is integer **cents** internally; Gemini returns **decimal major units** and the single conversion point is `src/lib/geminiParser.ts`. The server core never reads the environment — callers pass `apiKey`/`model` in.

---

## File Structure

| File | Responsibility |
|---|---|
| `api/_gemini.ts` *(new)* | Server-only core: image → Gemini → structured receipt JSON (decimal). No browser APIs, no env reads. |
| `api/ocr.ts` *(new)* | Vercel function `POST /api/ocr`. Reads `GEMINI_KEY` from env, calls the core, returns JSON; non-200 on failure. |
| `src/lib/geminiParser.ts` *(new, pure)* | Untrusted Gemini JSON → `ParsedReceipt` (decimal → cents, drop junk rows, clamp tax/tip ≥ 0). |
| `src/lib/geminiOcr.ts` *(new, browser)* | Downscale image → base64 → `POST /api/ocr` → `parseGemini`. Emits progress. Throws on failure. |
| `src/lib/ocr.ts` *(refactor)* | Orchestrator: Gemini when online, Donut fallback. Adds `'uploading'` stage + `activeEngine`. |
| `src/pages/Capture.tsx` *(edit)* | Honest copy + dynamic engine label. |
| `vite.config.ts` *(edit)* | Dev-only `/api/ocr` middleware reusing the core; honest manifest description. |
| `scripts/gemini-ocr.ts` *(new)* | Manual smoke test of the live Gemini path against a receipt image. |
| `scripts/test-gemini-parser.ts` *(new)* | Deterministic assertions for `parseGemini`. |
| `package.json` *(edit)* | Add `tsx` devDependency + `test:gemini-parser` / `ocr:gemini` scripts. |
| `README.md`, `PRODUCT_SPEC.md` *(edit)* | Honesty pass on the "nothing uploaded / on-device" claims. |

---

## Task 1: Tooling — `tsx` + npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the dev dependency**

Run: `npm install -D tsx`
Expected: `tsx` appears under `devDependencies` in `package.json`; install completes without errors.

- [ ] **Step 2: Add npm scripts**

In `package.json`, add these two entries to the `"scripts"` object (after `"typecheck"`):

```json
    "test:gemini-parser": "tsx scripts/test-gemini-parser.ts",
    "ocr:gemini": "tsx scripts/gemini-ocr.ts"
```

- [ ] **Step 3: Verify tsx runs**

Run: `npx tsx --eval "console.log('tsx ok')"`
Expected: prints `tsx ok`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add tsx for running TypeScript node scripts"
```

---

## Task 2: Pure parser `src/lib/geminiParser.ts` (TDD)

**Files:**
- Create: `scripts/test-gemini-parser.ts`
- Create: `src/lib/geminiParser.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-gemini-parser.ts`:

```ts
// Deterministic assertions for the pure Gemini receipt parser. No network.
import assert from 'node:assert/strict'
import { parseGemini } from '../src/lib/geminiParser'

// decimal major units → integer cents
{
  const r = parseGemini({ items: [{ name: 'Coffee', price: 4.5 }], tax: 0.3, tip: 0 })
  assert.deepEqual(r.items, [{ name: 'Coffee', price: 450 }])
  assert.equal(r.tax, 30)
  assert.equal(r.tip, 0)
}

// junk rows dropped: blank name, non-positive price
{
  const r = parseGemini({
    items: [
      { name: '', price: 9.99 },
      { name: 'Subtotal', price: 0 },
      { name: 'Burger', price: 12 },
    ],
    tax: 1,
    tip: 2,
  })
  assert.deepEqual(r.items, [{ name: 'Burger', price: 1200 }])
  assert.equal(r.tax, 100)
  assert.equal(r.tip, 200)
}

// negative/missing tax & tip clamp/default to 0
{
  const r = parseGemini({ items: [], tax: -5 })
  assert.equal(r.tax, 0)
  assert.equal(r.tip, 0)
}

// title: whitespace-collapsed when present, absent when blank
{
  const r = parseGemini({ title: '  Cafe   Luna ', items: [], tax: 0, tip: 0 })
  assert.equal(r.title, 'Cafe Luna')
  const r2 = parseGemini({ items: [], tax: 0, tip: 0 })
  assert.equal(r2.title, undefined)
}

// totally malformed input does not throw, yields an empty receipt
{
  const r = parseGemini(null)
  assert.deepEqual(r.items, [])
  assert.equal(r.tax, 0)
  assert.equal(r.tip, 0)
}

console.log('✓ geminiParser: all assertions passed')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:gemini-parser`
Expected: FAIL — cannot resolve `../src/lib/geminiParser` (module does not exist yet).

- [ ] **Step 3: Implement the parser**

Create `src/lib/geminiParser.ts`:

```ts
// Parser for Gemini's structured receipt JSON → ParsedReceipt. Gemini returns
// amounts as decimal MAJOR units (e.g. 12.50); this is the single place we
// convert to integer cents. Input is untrusted, so every field is validated.
// Pure + testable, no network — mirrors donutParser.ts.

import type { ParsedReceipt } from '../types'

/** Decimal major-unit amount → integer cents, or null if not a usable number. */
function toCents(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

function cleanName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function parseGemini(json: unknown): ParsedReceipt {
  const obj = (json ?? {}) as {
    title?: unknown
    items?: unknown
    tax?: unknown
    tip?: unknown
  }

  const items: { name: string; price: number }[] = []
  const rows = Array.isArray(obj.items) ? obj.items : []
  for (const row of rows) {
    const r = (row ?? {}) as { name?: unknown; price?: unknown }
    const name = cleanName(r.name)
    const price = toCents(r.price)
    if (!name || price == null || price <= 0) continue // header/total/junk rows
    items.push({ name, price })
  }

  const tax = Math.max(0, toCents(obj.tax) ?? 0)
  const tip = Math.max(0, toCents(obj.tip) ?? 0)
  const title = cleanName(obj.title)

  return { items, tax, tip, ...(title ? { title } : {}) }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:gemini-parser`
Expected: PASS — prints `✓ geminiParser: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-gemini-parser.ts src/lib/geminiParser.ts
git commit -m "feat(ocr): pure Gemini receipt JSON parser (decimal → cents)"
```

---

## Task 3: Server core `api/_gemini.ts` + live smoke script

**Files:**
- Create: `api/_gemini.ts`
- Create: `scripts/gemini-ocr.ts`

- [ ] **Step 1: Implement the server core**

Create `api/_gemini.ts`:

```ts
// Server-only core: send a receipt image to Gemini and return structured receipt
// JSON (amounts in decimal MAJOR units). No browser APIs and no env reads — the
// caller passes apiKey/model — so this runs unchanged in a Vercel function, the
// Vite dev middleware, and Node smoke scripts.

const DEFAULT_MODEL = 'gemini-3.5-flash'

const PROMPT = [
  'You are reading a photo of a restaurant or store receipt.',
  'Extract every ordered line item with its price exactly as printed.',
  'Rules:',
  '- "price" is the line total for that item as a decimal number (e.g. 12.50), no currency symbol.',
  '- Do NOT include subtotal, total, balance, change, or payment lines as items.',
  '- "tax" is the tax amount; "tip" is the tip or service charge amount (use 0 if none).',
  '- "title" is the merchant/restaurant name if clearly visible, otherwise omit it.',
  'Return decimal numbers, never strings.',
].join('\n')

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, price: { type: 'NUMBER' } },
        required: ['name', 'price'],
      },
    },
    tax: { type: 'NUMBER' },
    tip: { type: 'NUMBER' },
  },
  required: ['items', 'tax', 'tip'],
}

export interface RunGeminiArgs {
  imageBase64: string // raw base64, no "data:" prefix
  mimeType: string
  apiKey: string
  model?: string
}

/** Calls Gemini and returns the parsed JSON object (still in decimal units). */
export async function runGeminiOcr({
  imageBase64,
  mimeType,
  apiKey,
  model,
}: RunGeminiArgs): Promise<unknown> {
  if (!apiKey) throw new Error('Missing Gemini API key')
  const id = model || DEFAULT_MODEL
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent?key=${apiKey}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no content')
  return JSON.parse(text)
}
```

- [ ] **Step 2: Write the smoke script**

Create `scripts/gemini-ocr.ts`:

```ts
// Manual smoke test of the live Gemini OCR path. Loads GEMINI_KEY from .env,
// reads a receipt image from argv, prints the raw Gemini JSON and the parsed
// (cents) ParsedReceipt. Usage: npm run ocr:gemini -- /path/to/receipt.jpg
import { readFileSync } from 'node:fs'
import { runGeminiOcr } from '../api/_gemini'
import { parseGemini } from '../src/lib/geminiParser'

try {
  process.loadEnvFile('.env')
} catch {
  /* .env optional if GEMINI_KEY already in the environment */
}

const imgPath = process.argv[2]
if (!imgPath) {
  console.error('usage: npm run ocr:gemini -- <path-to-receipt-image>')
  process.exit(1)
}

const ext = imgPath.split('.').pop()?.toLowerCase()
const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'
const imageBase64 = readFileSync(imgPath).toString('base64')

const t0 = Date.now()
const raw = await runGeminiOcr({
  imageBase64,
  mimeType,
  apiKey: process.env.GEMINI_KEY ?? '',
  model: process.env.GEMINI_MODEL,
})
console.log('\n===== RAW Gemini JSON =====')
console.log(JSON.stringify(raw, null, 2))
console.log('\n===== Parsed (cents) =====')
console.log(JSON.stringify(parseGemini(raw), null, 2))
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
```

- [ ] **Step 3: Run the smoke script against a receipt image**

Run: `npm run ocr:gemini -- /path/to/any/receipt.jpg`
Expected: prints a `RAW Gemini JSON` block with `items`, then a `Parsed (cents)` block where each `price` is an integer (e.g. `450` for $4.50). If you have no receipt image handy, skip this step — the end-to-end app run in Task 10 also exercises this path.

- [ ] **Step 4: Commit**

```bash
git add api/_gemini.ts scripts/gemini-ocr.ts
git commit -m "feat(ocr): Gemini server core + live smoke script"
```

---

## Task 4: Vercel function `api/ocr.ts`

**Files:**
- Create: `api/ocr.ts`

- [ ] **Step 1: Implement the handler**

Create `api/ocr.ts`:

```ts
// Vercel serverless function: POST /api/ocr  { imageBase64, mimeType }
// Holds GEMINI_KEY server-side and proxies to Gemini; the key never reaches the
// client. Returns the structured receipt JSON (decimal units) on success, or a
// non-200 the browser treats as "fall back to on-device OCR".
import { runGeminiOcr } from './_gemini'

// Minimal structural types so we need no @vercel/node dependency.
interface Req {
  method?: string
  body?: unknown
}
interface Res {
  status: (code: number) => Res
  json: (body: unknown) => void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const apiKey = process.env.GEMINI_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_KEY not configured' })
    return
  }

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as {
    imageBase64?: string
    mimeType?: string
  }
  if (!body.imageBase64 || !body.mimeType) {
    res.status(400).json({ error: 'imageBase64 and mimeType are required' })
    return
  }

  try {
    const receipt = await runGeminiOcr({
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      apiKey,
      model: process.env.GEMINI_MODEL,
    })
    res.status(200).json(receipt)
  } catch (err) {
    res.status(502).json({ error: (err as Error).message })
  }
}
```

- [ ] **Step 2: Verify the build is unaffected**

Run: `npm run build`
Expected: PASS. (`api/` is outside both tsconfigs, so this confirms the new file does not break the app build. The function itself is exercised in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add api/ocr.ts
git commit -m "feat(ocr): Vercel /api/ocr proxy function"
```

---

## Task 5: Vite dev middleware for `/api/ocr`

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Rewrite the config to add the dev middleware**

Replace the entire contents of `vite.config.ts` with:

```ts
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
          theme_color: '#4f46e5',
          background_color: '#f1f3f7',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          icons: [
            { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
            { src: 'icon-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Donut ONNX weights + tokenizer are large; cache them on first use so
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
```

> Note: the `icon-512` entry's `purpose` is restored to `'any'` if it differs — keep it exactly as the original had it (`'any'` for 512 `any`, `'maskable'` for the maskable icon). Verify against the current file before saving so icon purposes are unchanged.

- [ ] **Step 2: Verify the config type-checks**

Run: `npm run typecheck`
Expected: PASS (no type errors from the new import or plugin).

- [ ] **Step 3: Verify `/api/ocr` end-to-end in dev**

Run the dev server in the background, then POST a 1×1 PNG and confirm the proxy reaches Gemini (a tiny blank image legitimately yields zero items — success is a JSON response, not an HTTP error):

```bash
npm run dev &
sleep 4
curl -s -X POST http://localhost:5173/api/ocr \
  -H 'Content-Type: application/json' \
  -d '{"imageBase64":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC","mimeType":"image/png"}'
echo
kill %1
```

Expected: a JSON object (e.g. `{"items":[],"tax":0,"tip":0}` or similar) — **not** an `{"error":...}` 502 and not an HTML 404. If you get `GEMINI_KEY not configured`/missing-key errors, confirm `.env` contains `GEMINI_KEY`.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "feat(ocr): dev-only /api/ocr middleware reusing the Gemini core"
```

---

## Task 6: Client OCR path `src/lib/geminiOcr.ts`

**Files:**
- Create: `src/lib/geminiOcr.ts`

- [ ] **Step 1: Implement the browser path**

Create `src/lib/geminiOcr.ts`:

```ts
// Client side of the Gemini OCR path: downscale the receipt photo, POST it to the
// /api/ocr proxy (which holds the key), and parse the structured JSON into a
// ParsedReceipt. All network + browser-image concerns live here. Throws on any
// failure so the orchestrator can fall back to on-device Donut.

import { parseGemini } from './geminiParser'
import type { ParsedReceipt } from '../types'
import type { OcrProgress } from './ocr'

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.8

/** Downscale to <= MAX_EDGE on the longest side and re-encode as a JPEG blob. */
async function downscale(imageUrl: string): Promise<Blob> {
  const srcBlob = await (await fetch(imageUrl)).blob()
  const bitmap = await createImageBitmap(srcBlob)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob produced no blob'))),
      'image/jpeg',
      JPEG_QUALITY,
    ),
  )
}

/** Blob → raw base64 (strips the "data:...;base64," prefix). */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

export async function geminiScan(
  imageUrl: string,
  onProgress?: (p: OcrProgress) => void,
): Promise<ParsedReceipt> {
  onProgress?.({ stage: 'uploading', label: 'Uploading to Gemini…' })
  const blob = await downscale(imageUrl)
  const imageBase64 = await toBase64(blob)

  onProgress?.({ stage: 'recognizing', label: 'Reading the receipt…' })
  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
  })
  if (!res.ok) throw new Error(`/api/ocr responded ${res.status}`)
  const json = await res.json()

  onProgress?.({ stage: 'parsing', label: 'Sorting items…' })
  return parseGemini(json)
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck`
Expected: PASS. (`OcrProgress` is imported as a type from `./ocr`; the `'uploading'` stage is added to that union in Task 7, so if typecheck flags an unknown `'uploading'` stage here, proceed to Task 7 — they are committed together is acceptable, but prefer doing Task 7 next.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/geminiOcr.ts
git commit -m "feat(ocr): browser Gemini path — downscale, proxy POST, parse"
```

---

## Task 7: Orchestrator refactor `src/lib/ocr.ts`

**Files:**
- Modify: `src/lib/ocr.ts`

- [ ] **Step 1: Add the `'uploading'` stage to the progress type**

In `src/lib/ocr.ts`, change the `OcrProgress` interface's `stage` union:

```ts
export interface OcrProgress {
  stage: 'uploading' | 'loading-model' | 'recognizing' | 'parsing'
  /** 0..1 for the model download, undefined for indeterminate stages */
  progress?: number
  label: string
}
```

- [ ] **Step 2: Rename the existing `scanReceipt` to `donutScan`**

In `src/lib/ocr.ts`, find the exported `scanReceipt` function (the Donut implementation, starting `export async function scanReceipt(`) and rename it to a non-exported `donutScan` — change only its signature line:

```ts
async function donutScan(
  imageUrl: string,
  onProgress?: ProgressFn,
): Promise<ParsedReceipt> {
```

Leave its body unchanged.

- [ ] **Step 3: Add the orchestrator + engine flag**

Add this import near the top of `src/lib/ocr.ts` (with the other imports):

```ts
import { geminiScan } from './geminiOcr'
```

Then add, immediately above the (now-renamed) `donutScan` function:

```ts
/** Which engine produced the last result — exposed for the UI label/diagnostics. */
export let activeEngine: 'gemini' | 'donut' | null = null

/**
 * Run OCR on an image and return a parsed receipt. Tries the cloud Gemini path
 * first when online; on offline / failure / empty result, falls back to on-device
 * Donut. Throws only if BOTH paths fail — callers route that to manual entry.
 */
export async function scanReceipt(
  imageUrl: string,
  onProgress?: ProgressFn,
): Promise<ParsedReceipt> {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  if (online) {
    try {
      const parsed = await geminiScan(imageUrl, onProgress)
      if (parsed.items.length > 0) {
        activeEngine = 'gemini'
        if (typeof window !== 'undefined') (window as any).__ocrEngine = 'gemini'
        return parsed
      }
      console.warn('[ocr] Gemini returned no items — falling back to on-device…')
    } catch (err) {
      console.warn('[ocr] Gemini path failed — falling back to on-device…', err)
    }
  }
  const parsed = await donutScan(imageUrl, onProgress)
  activeEngine = 'donut'
  if (typeof window !== 'undefined') (window as any).__ocrEngine = 'donut'
  return parsed
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npm run typecheck`
Expected: PASS — `geminiOcr.ts` and `ocr.ts` now agree on `OcrProgress`, and `scanReceipt`'s public signature is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ocr.ts
git commit -m "feat(ocr): orchestrate Gemini-primary with Donut fallback"
```

---

## Task 8: Capture screen — honest copy + engine label

**Files:**
- Modify: `src/pages/Capture.tsx`

- [ ] **Step 1: Track which path is running**

In `src/pages/Capture.tsx`, add an `onDevice` flag and set it when the Donut model-download stage appears.

Add to the component state (near the other `useState` calls, around line 16):

```tsx
  const [onDevice, setOnDevice] = useState(false)
```

Update `onProgress` (around line 19) to:

```tsx
  function onProgress(p: OcrProgress) {
    setProgress(p)
    if (p.stage === 'loading-model') setOnDevice(true)
    if (activeDevice) setDevice(activeDevice)
  }
```

- [ ] **Step 2: Make the idle subtitle honest**

Replace the idle card subtitle line (currently `Lay it flat and fill the frame. Reads on your device — nothing is uploaded.`):

```tsx
              Lay it flat and fill the frame. Read with Gemini; falls back to
              on-device when you're offline.
```

- [ ] **Step 3: Make the working-state note dynamic**

Replace the working-state note block (currently the `🔒 Donut (CORD) · runs locally…` `<div>`):

```tsx
          <div className="small muted" style={{ marginTop: 10 }}>
            {onDevice
              ? `🔒 On-device (Donut)${device ? ` · ${device.toUpperCase()}` : ''} — model downloads once, then it's cached.`
              : '☁️ Reading with Gemini — your receipt photo is sent to the cloud for this scan.'}
          </div>
```

- [ ] **Step 4: Soften the error copy (failure may be network, not just on-device)**

Replace the catch-block error message (currently `'On-device OCR failed to load. No worries — enter the items manually.'`):

```tsx
      setError("Couldn't read the receipt automatically. No worries — enter the items manually.")
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: PASS (tsc + vite build). Confirms no unused vars (`onDevice` is used) and JSX is valid.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Capture.tsx
git commit -m "feat(ocr): Capture shows Gemini/on-device path with honest copy"
```

---

## Task 9: Documentation honesty pass

**Files:**
- Modify: `README.md`
- Modify: `PRODUCT_SPEC.md`

- [ ] **Step 1: Update `README.md` intro (line ~4)**

Replace:

```
tax & tip** and **on-device OCR** (the image never leaves your phone). A PWA you
```

with:

```
tax & tip** and **Gemini-powered OCR** (with an on-device fallback when offline). A PWA you
```

- [ ] **Step 2: Update `README.md` "How it works" step 1 (lines ~30–35)**

Replace the step-1 paragraph (the `**Snap** a receipt → on-device **Donut** …` block through `…text is ever uploaded.`) with:

```
1. **Snap** a receipt → it's read by **Gemini 3.5 Flash** via a small serverless
   proxy (`/api/ocr`) that keeps the API key server-side. Gemini returns structured
   line items, prices, tax, and tip. When you're **offline** (or the cloud call
   fails), it falls back to **on-device Donut** (`Xenova/donut-base-finetuned-cord-v2`
   via transformers.js, WebGPU→WASM), so scanning still works with nothing uploaded.
```

- [ ] **Step 3: Update the README "Architecture" / "Key decisions" notes**

In the `lib/` tree comment block, update the `ocr.ts` line and add the new files so the list matches reality:

```
    ocr.ts              orchestrator: Gemini (cloud) primary, Donut fallback
    geminiOcr.ts        browser Gemini path: downscale → /api/ocr → parse
    geminiParser.ts     Gemini JSON → {items, tax, tip} (pure, decimal→cents)
    donutParser.ts      Donut output → {items, tax, tip} (pure, no ML)
```

And update the "No backend" bullet to reflect the proxy:

```
- **Thin serverless proxy.** OCR now calls Gemini through `/api/ocr` (a Vercel
  function holding `GEMINI_KEY`); everything else stays device-local. Bills are
  ephemeral; history & saved friends persist in localStorage. The Deploy section
  covers setting `GEMINI_KEY` in Vercel.
```

- [ ] **Step 4: Add the `GEMINI_KEY` deploy step to the README "Deploy (Vercel)" section**

Add immediately under the Deploy heading's intro:

```
> **Required:** set `GEMINI_KEY` in the Vercel project (Settings → Environment
> Variables, or `vercel env add GEMINI_KEY production`). It is read only inside the
> `/api/ocr` function and never shipped to the client. Without it, OCR falls back
> to on-device Donut. Locally, the same key is read from your gitignored `.env`.
```

- [ ] **Step 5: Update `PRODUCT_SPEC.md` OCR references**

- Line ~8: replace `most people, and all OCR runs on-device.` with `most people. OCR runs in the cloud (Gemini) with an on-device fallback.`
- Line ~21 (happy-path step 2): replace `**On-device OCR (transformers.js)** extracts line items, prices, tax, tip.` with `**Gemini OCR** (via the `/api/ocr` proxy) extracts line items, prices, tax, tip; on-device Donut is the offline fallback.`
- Line ~41 (locked-decisions table OCR row): replace `| OCR | transformers.js, on-device |` with `| OCR | Gemini 3.5 Flash via serverless proxy; on-device Donut fallback |`

- [ ] **Step 6: Commit**

```bash
git add README.md PRODUCT_SPEC.md
git commit -m "docs: reflect Gemini-primary OCR + on-device fallback"
```

---

## Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full build + parser test**

Run: `npm run build && npm run test:gemini-parser`
Expected: build PASS; parser prints `✓ geminiParser: all assertions passed`.

- [ ] **Step 2: End-to-end dev run (manual)**

Run `npm run dev`, open the app, start a new bill, and scan a real receipt photo.
Expected: the working note shows `☁️ Reading with Gemini…`, then the Review screen lists items with correct prices. Toggle the browser to **offline** and scan again: it should show the on-device `🔒 Donut` path (first run downloads the model). Both paths land on Review; failures land on manual entry.

- [ ] **Step 3: Commit any final touch-ups**

```bash
git add -A
git commit -m "chore(ocr): finalize Gemini OCR migration" || echo "nothing to commit"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** serverless proxy (Tasks 3–5), Gemini-primary/Donut-fallback orchestration (Task 7), `gemini-3.5-flash` + `GEMINI_MODEL` override (Task 3), JSON mode + responseSchema (Task 3), decimal→cents in one place (Task 2), Vite dev middleware (Task 5), Node smoke + parser scripts (Tasks 2–3), copy honesty pass + Vercel `GEMINI_KEY` deploy step (Tasks 8–9). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code; every command has an expected result.
- **Type consistency:** `parseGemini(json: unknown)` used identically in Tasks 2/3/6; `runGeminiOcr` args/return (`Promise<unknown>`) consistent across Tasks 3/4/5; `OcrProgress` gains `'uploading'` (Task 7) before `geminiOcr.ts` (Task 6) relies on it — order note added in Task 6 Step 2; `scanReceipt` keeps its original signature so `Capture.tsx` needs no call-site change.

## Notes / risks

- **Privacy posture:** the primary path uploads the receipt to Google; copy updated in Tasks 8–9. On-device fallback preserves the no-upload path offline.
- **Vercel env:** production OCR requires `GEMINI_KEY` set in Vercel (Task 9 Step 4); otherwise it falls back to Donut.
- **No browser automation here:** the browser-only `geminiOcr.ts` and the orchestrator are verified via `typecheck`/`build` and the manual run in Task 10 (WebGPU/headless and browser-driving are unavailable in this environment).
