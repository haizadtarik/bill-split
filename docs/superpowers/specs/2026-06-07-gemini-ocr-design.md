# SplitBill — Gemini OCR Design

_Date: 2026-06-07_

## Problem

The current on-device OCR (Donut CORD-v2 via transformers.js) is not accurate
enough on real receipt photos. We want to switch the **primary** receipt reader to
**Gemini 3.5 Flash**, while keeping the app's offline and privacy-fallback story
intact.

## Decisions (locked during brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Where Gemini is called | **Serverless proxy** (Vercel function) | Keeps `GEMINI_KEY` server-side; never ships to the client. Safe for a public deploy. |
| Fate of Donut | **Gemini primary, Donut fallback** | Preserves offline scanning + an on-device privacy path when the network/proxy fails. |
| Model | `gemini-3.5-flash` (env-overridable via `GEMINI_MODEL`) | Confirmed reachable with the project key; requested by the user. |
| Gemini output | **Structured JSON** (JSON mode + `responseSchema`) with amounts as **decimal major units** | Matches what's printed on receipts; the parser converts to integer cents, preserving the cents-everywhere rounding discipline. |
| Local dev | **Vite dev-only middleware** mounting the same handler at `/api/ocr` | Plain `npm run dev` keeps working with no extra CLI; prod uses the real Vercel function. |
| Testing | **Node smoke-scripts** (no test framework added) | Matches the repo's existing convention (`scripts/ocr-node.mjs`); WebGPU/browser automation is unavailable headless here. |

## Architecture & data flow

```
Capture.tsx
  → scanReceipt(imageUrl, onProgress)        [src/lib/ocr.ts — ORCHESTRATOR]
       ├─ online?  → geminiScan()            [src/lib/geminiOcr.ts]
       │              → downscale image (canvas, ~1600px, JPEG q0.8)
       │              → POST {imageBase64, mimeType} to  /api/ocr
       │                   └─ api/ocr.ts (Vercel function, holds GEMINI_KEY)
       │                        → Gemini 3.5 Flash, JSON mode + responseSchema
       │                        → returns structured receipt JSON
       │              → geminiParser(json) → ParsedReceipt (cents)
       │
       └─ offline OR Gemini failed → donutScan()  [existing on-device path]
```

`scanReceipt(imageUrl, onProgress)` keeps its **exact current signature**, so
`Capture.tsx`'s flow barely changes — it routes to Gemini first, Donut second. The
existing safety nets stay: "0 items → manual entry" and "threw → manual entry".
OCR remains an accelerator, never a hard dependency.

## Components

### `api/ocr.ts` (new — Vercel serverless function)
- **Purpose:** read `process.env.GEMINI_KEY` server-side, call Gemini with the image
  as `inline_data`, return parsed receipt JSON.
- **Input:** `POST` JSON body `{ imageBase64: string, mimeType: string }`.
- **Output:** `200` with `{ title?, items: [{name, price}], tax, tip }` (amounts in
  decimal major units), or a non-200 error the client treats as "fall back to Donut".
- **Depends on:** `GEMINI_KEY` (+ optional `GEMINI_MODEL`) in the runtime env; the
  Gemini `generateContent` REST endpoint.
- **Key handling:** the key never appears in any response or client bundle.

### `src/lib/geminiOcr.ts` (new — client network layer)
- **Purpose:** turn a browser image URL into a `ParsedReceipt` via the proxy.
- **Does:** fetch the object URL → blob → **downscale** on a canvas (longest edge
  ~1600px, JPEG q0.8, keeps payload under Vercel's body limit and cuts latency/cost)
  → base64 → `POST /api/ocr` → hand the JSON to `geminiParser`.
- **Emits progress:** `'uploading'` → `'recognizing'` → `'parsing'`.
- **Depends on:** `geminiParser`, the `/api/ocr` endpoint.

### `src/lib/geminiParser.ts` (new — pure, testable)
- **Purpose:** Gemini JSON → `ParsedReceipt`, converting decimal major-unit amounts
  to integer **cents**, dropping junk rows (no name or non-positive price), and
  clamping tax/tip to `>= 0`. No network, no ML — mirrors `donutParser.ts`.
- **Depends on:** `lib/money` (`parseCents`/rounding helpers) and `types`.

### `src/lib/ocr.ts` (refactor — orchestrator)
- Existing Donut engine code moves behind an internal `donutScan()`.
- New top-level `scanReceipt` tries `geminiScan()` first when `navigator.onLine`,
  falling back to `donutScan()` on offline/failure/empty-result.
- `OcrProgress.stage` union gains `'uploading'`.
- Exposes which engine actually ran (for the Capture UI label + diagnostics).

### `src/pages/Capture.tsx` (small edit)
- Engine label becomes dynamic: "☁️ Gemini" when the cloud path ran, "🔒 on-device
  (Donut)" when the fallback ran.
- The "nothing is uploaded" line becomes honest about the cloud-primary path.

### Copy updates (honesty pass)
The "nothing uploaded / on-device" claim appears in several places and must be
updated to "read in the cloud by Gemini, with an on-device fallback when offline":
- `README.md` (intro + "How it works" + Architecture notes)
- `PRODUCT_SPEC.md` (OCR sections)
- `vite.config.ts` (PWA manifest `description`)
- `src/pages/Capture.tsx` (in-screen copy)

## Gemini call details

- **Model:** `gemini-3.5-flash`, overridable via `GEMINI_MODEL`.
- **JSON mode:** `responseMimeType: "application/json"` + a `responseSchema` shaped
  as `{ title?: string, items: [{ name: string, price: number }], tax: number,
  tip: number }`.
- **Amounts:** decimal major units exactly as printed (e.g. `12.50`); `geminiParser`
  multiplies to cents.
- **Prompt guidance:** extract line items + their unit prices as shown; capture tax
  and tip/service charge separately; do **not** emit subtotal/total lines as items.

## Fallback triggers

Fall back to Donut when **any** of:
- `!navigator.onLine`
- the proxy/network request throws or times out
- the proxy returns a non-200
- Gemini yields zero usable items after parsing

Donut's own failure still routes the user to manual entry (unchanged).

## Local dev vs. production

- **Local (`npm run dev`):** a Vite **dev-only middleware plugin** mounts the same
  `api/ocr` handler at `/api/ocr`, reading `GEMINI_KEY` from the gitignored `.env`.
  No extra CLI required.
- **Production (Vercel):** the real serverless function serves `/api/ocr`.
  `GEMINI_KEY` is **not** read from the repo (`.env` is gitignored and never
  deployed) — it must be configured in the Vercel project:
  **Settings → Environment Variables**, or `vercel env add GEMINI_KEY production`
  (plus `preview`/`development` scopes as desired). **This is a required deploy
  step** — the production OCR will not work until the var is set.

## Testing

No test framework exists in this repo; it uses Node diagnostic scripts. Match that:
- **`scripts/gemini-ocr.mjs`** (new) — mirrors `scripts/ocr-node.mjs`: runs the
  Gemini path against a sample receipt image and prints the parsed result, for
  eyeballing accuracy vs. the old Donut output.
- **Pure-parser assertions** — small inline checks for `geminiParser` (junk rows
  dropped, amounts → cents, tax/tip clamped).
- The Donut fallback stays node-script-verified (WebGPU is unavailable headless
  here, and there's no browser automation in this environment).

## Out of scope

- Multi-currency / FX (app is single-currency by spec).
- Payments / settle-up.
- Changes to the Review / Assign / Results / split logic.
- Removing Donut or transformers.js.

## Risks & notes

- **Privacy posture changes:** receipts now leave the device on the primary path.
  The copy updates above make this explicit; the on-device fallback remains for
  offline use.
- **Vercel body size:** client-side downscale keeps the base64 payload well under
  the function's request-body limit.
- **Cost/latency:** Flash + downscaled images keep both low; acceptable for the
  "personal / friends use" intent.
