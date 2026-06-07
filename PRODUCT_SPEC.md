# SplitBill — Product Spec (v1)

_Last updated: 2026-05-30_

## One-liner
A PWA that lets friends at a restaurant snap a receipt, assign who-ordered-what,
and instantly see who owes the organizer how much — no app install required for
most people. OCR runs in the cloud (Gemini) with an on-device fallback.

## Target user
**Casual friends dining out.** One person ("the organizer") drives the bill;
everyone else is low-commitment and may never sign in.

## Core job (scope boundary)
**Track IOUs only.** The app calculates and displays who owes whom. No money
movement, no payment processing, no financial compliance. Settling happens
off-app (cash, Venmo, etc.).

## Happy path (v1)
1. Organizer starts a new bill and **snaps a photo of the receipt**.
2. **Gemini OCR** (via the `/api/ocr` proxy) extracts line items, prices, tax, tip;
   on-device GLM-OCR is the offline fallback.
3. Organizer **reviews/corrects** parsed items (manual edit is the safety net).
4. Organizer **assigns each item** to a person (or splits a shared item among
   several). People are identified by **typed nicknames**.
5. **Tax & tip are allocated proportionally** to each person's subtotal.
6. Result screen shows each person's total; organizer shares a link/screenshot.

## Locked decisions
| Decision | Choice |
|---|---|
| Splitting math | Full flexibility — itemized per-person, shares for split items, % |
| Tax/tip | Proportional to each person's order |
| Persistence | Ephemeral — each bill standalone, no running balances |
| Onboarding | Organizer + optional accounts (link-only works; sign-in is convenience) |
| Account payoff | Saved friends/groups + bill-history archive |
| Item entry | OCR-first, manual fallback |
| Assignment (v1) | **Organizer-assigns only** (self-claim deferred) |
| Currency | Single currency, no FX |
| Identity | Typed nicknames; organizer responsible for keeping them distinct |
| Platform | PWA (one codebase, mobile + web) |
| OCR | Gemini 3.5 Flash via serverless proxy; on-device GLM-OCR fallback |
| Intent | Personal / friends use — ship fast, be genuinely useful |

## Explicitly deferred (post-v1)
- **Diner self-claim / live sessions** (needs real-time multi-device sync).
- Running balances across outings.
- Payments / settle-up integrations.
- Multi-currency.

## OCR plan (the long pole)
**Primary: Gemini 3.5 Flash** via the `/api/ocr` serverless proxy, which returns
structured receipt JSON. **On-device fallback: GLM-OCR** (`onnx-community/GLM-OCR-ONNX`)
via transformers.js — a 0.9B vision-language model (CogViT encoder + GLM-0.5B decoder)
that tops OmniDocBench while staying small enough to run in the browser.

> Earlier on-device engines were tried and dropped: **Florence-2** (`<OCR_WITH_REGION>`)
> lost right-aligned price columns separated by wide gaps, and receipt-tuned **Donut**
> (CORD-v2) was replaced by GLM-OCR for materially better accuracy on real receipts.

Two parts:
1. **Recognition** — GLM-OCR is prompted (chat template + image) to emit the **same
   JSON shape Gemini returns** (`{title, items:[{name, price}], tax, tip}`).
2. **Parsing** — `geminiParser.ts` converts that JSON → `{items, tax, tip}` in integer
   cents, rejecting junk/total rows. One pure, unit-tested parser serves both engines.

Notes:
- Runs on **WebGPU** when a usable adapter exists, else **single-thread WASM**
  (no SharedArrayBuffer / COOP-COEP requirement). The active device is shown in-app.
- 4-bit (q4) weights keep the first download browser-friendly; cache via the
  **service worker** (one-time, PWA).
- **Manual edit is always the correction path** — the cloud path is most accurate;
  the on-device model is the offline/privacy safety net.

## Suggested build sequencing
- **MVP:** manual entry → organizer-assigns → proportional tax/tip → results link.
- **+OCR:** wire in Florence-2 + parsing on top of the manual flow.
- **Later:** accounts (saved friends + history), then self-claim sessions.

## Open questions / decisions still to make
- Unclaimed-item handling is N/A in v1 (organizer assigns everything) — revisit
  when self-claim lands.
- Rounding policy when proportional split produces fractional cents.
- Tech stack specifics (framework, state, storage for optional accounts).
