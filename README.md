# SplitBill 🧾

Snap a receipt, assign who-ordered-what, and split the bill — with **proportional
tax & tip** and **Gemini-powered OCR** (with an on-device fallback when offline). A PWA you
can install to your home screen.

Built for casual friends dining out: the organizer drives, nobody else needs an
account, and everything works offline after first load.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build (+ service worker)
npm run preview    # serve the production build locally
npm run typecheck  # types only
```

> Open it on your phone (or use your browser's device toolbar) — the layout is a
> mobile-first column.

## How it works

1. **Snap** a receipt → it's read by **Gemini 3.5 Flash** via a small serverless
   proxy (`/api/ocr`) that keeps the API key server-side. Gemini returns structured
   line items, prices, tax, and tip. When you're **offline** (or the cloud call
   fails), it falls back to **on-device GLM-OCR** (`onnx-community/GLM-OCR-ONNX`
   via transformers.js, WebGPU→WASM) — a 0.9B vision-language model prompted to
   return the same structured JSON, so scanning still works with nothing uploaded.
2. **Review** the parsed items — fix anything, add/remove, set tax & tip (with
   15/18/20% quick buttons). Manual entry is always available as a fallback.
3. **Assign** each item to one or more diners (shared items split evenly), or tap
   *Split everything evenly*.
4. **Results** show a shareable receipt: each person's total with **tax & tip
   allocated in proportion to what they ordered**. Share via the system sheet or
   copy to clipboard.

## Architecture

```
src/
  types.ts              domain model (money is integer CENTS everywhere)
  store.ts              zustand store: draft bill + history + friends
  lib/
    split.ts            proportional split + largest-remainder rounding (cent-exact)
    ocr.ts              orchestrator: Gemini (cloud) primary, GLM-OCR fallback
    geminiOcr.ts        browser Gemini path: downscale → /api/ocr → parse
    geminiParser.ts     receipt JSON → {items, tax, tip} (Gemini + GLM, decimal→cents)
    storage.ts          localStorage: bill history + saved friends (offline-first)
    money.ts colors.ts id.ts
  pages/                Home · Capture · Review · Assign · Results · Bills · Friends
  components/           Avatar · TabBar
```

Key decisions (see `PRODUCT_SPEC.md` for the full rationale):

- **Money is integer cents** end-to-end; dollars only at the UI edge. No float drift.
- **Rounding policy:** largest-remainder (Hamilton) method — leftover pennies go to
  the largest fractional shares, so totals always reconcile exactly.
- **OCR is an accelerator, never a hard dependency** — any failure routes to manual
  entry. It prefers WebGPU and falls back to single-thread WASM (no SharedArrayBuffer
  / COOP-COEP requirement). The Capture screen shows which device actually ran.
- **Thin serverless proxy.** OCR now calls Gemini through `/api/ocr` (a Vercel
  function holding `GEMINI_KEY`); everything else stays device-local. Bills are
  ephemeral; history & saved friends persist in localStorage. The Deploy section
  covers setting `GEMINI_KEY` in Vercel.

## Design

Visual direction is the **Hybrid** from `designs/` — fintech structure + tabular
numerals, a per-friend color carried across every screen, and a receipt-styled
results page. Browse `designs/index.html` for the alternatives explored.

## Deploy (Vercel)

Zero-config — Vercel auto-detects Vite.

> **Required:** set `GEMINI_KEY` in the Vercel project (Settings → Environment
> Variables, or `vercel env add GEMINI_KEY production`). It is read only inside the
> `/api/ocr` function and never shipped to the client. Without it, OCR falls back
> to on-device GLM-OCR. Locally, the same key is read from your gitignored `.env`.

- **Build command:** `npm run build` · **Output dir:** `dist` (both auto-detected)
- Routing uses `HashRouter`, so deep links work with no rewrite rules.
- The OCR model is fetched client-side from HuggingFace and cached by the service
  worker; nothing server-side is required.

```bash
npx vercel        # preview deploy
npx vercel --prod # production
```

Or import the GitHub repo in the Vercel dashboard and deploy.

## Tech

Vite · React · TypeScript · zustand · react-router · transformers.js · vite-plugin-pwa
