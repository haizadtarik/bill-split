# SplitBill 🧾

Snap a receipt, assign who-ordered-what, and split the bill — with **proportional
tax & tip** and **on-device OCR** (the image never leaves your phone). A PWA you
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

1. **Snap** a receipt → on-device **Donut** (`Xenova/donut-base-finetuned-cord-v2`
   via transformers.js) reads it. Donut is a document model fine-tuned on receipts
   (CORD-v2), so it emits structured fields (item, price, subtotal, tax, total)
   rather than raw text. Runs on **WebGPU** when available, falling back to WASM.
   First scan downloads the model once; the service worker caches it. No photo or
   text is ever uploaded.
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
    donutParser.ts      Donut output → {items, tax, tip} (pure, no ML)
    ocr.ts              Donut engine, WebGPU→WASM ladder (lazy-loaded, isolates ML)
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
- **No backend.** Bills are ephemeral; history & saved friends persist locally per
  the spec. "Share" exports a text summary (since data is device-local).

## Design

Visual direction is the **Hybrid** from `designs/` — fintech structure + tabular
numerals, a per-friend color carried across every screen, and a receipt-styled
results page. Browse `designs/index.html` for the alternatives explored.

## Deploy (Vercel)

Zero-config — Vercel auto-detects Vite.

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
