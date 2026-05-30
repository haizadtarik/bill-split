# SplitBill — Product Spec (v1)

_Last updated: 2026-05-30_

## One-liner
A PWA that lets friends at a restaurant snap a receipt, assign who-ordered-what,
and instantly see who owes the organizer how much — no app install required for
most people, and all OCR runs on-device.

## Target user
**Casual friends dining out.** One person ("the organizer") drives the bill;
everyone else is low-commitment and may never sign in.

## Core job (scope boundary)
**Track IOUs only.** The app calculates and displays who owes whom. No money
movement, no payment processing, no financial compliance. Settling happens
off-app (cash, Venmo, etc.).

## Happy path (v1)
1. Organizer starts a new bill and **snaps a photo of the receipt**.
2. **On-device OCR (transformers.js)** extracts line items, prices, tax, tip.
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
| OCR | transformers.js, on-device |
| Intent | Personal / friends use — ship fast, be genuinely useful |

## Explicitly deferred (post-v1)
- **Diner self-claim / live sessions** (needs real-time multi-device sync).
- Running balances across outings.
- Payments / settle-up integrations.
- Multi-currency.

## OCR plan (the long pole)
**Engine: Donut** (`Xenova/donut-base-finetuned-cord-v2`) via transformers.js — a
document model fine-tuned on the CORD-v2 receipt dataset. It outputs **structured
fields directly** (`<s_menu><s_nm>…</s_nm><s_price>…</s_price>…<s_sub_total>
<s_tax_price>…`), not raw text.

> We first tried **Florence-2** (`<OCR_WITH_REGION>`) but it dropped right-aligned
> price columns separated by wide gaps — returning item names with no prices. Donut,
> being receipt-native, avoids this and is far more accurate on real receipt photos.

Two parts:
1. **Recognition** — Donut `generate` with the `<s_cord-v2>` task prompt.
2. **Parsing** — `donutParser.ts` maps the tagged output → `{items, tax, tip}`,
   rejecting non-numeric "price" fields (e.g. "Table 7") Donut sometimes mis-files.
   Pure + unit-tested.

Notes:
- Runs on **WebGPU** when a usable adapter exists, else **single-thread WASM**
  (no SharedArrayBuffer / COOP-COEP requirement). The active device is shown in-app.
- Sizable first download; cache via the **service worker** (one-time, PWA).
- Inference ≈ 2s once loaded. **Manual edit is always the correction path** — Donut
  is strongest on real receipt photos; clean synthetic text is off-distribution.

## Suggested build sequencing
- **MVP:** manual entry → organizer-assigns → proportional tax/tip → results link.
- **+OCR:** wire in Florence-2 + parsing on top of the manual flow.
- **Later:** accounts (saved friends + history), then self-claim sessions.

## Open questions / decisions still to make
- Unclaimed-item handling is N/A in v1 (organizer assigns everything) — revisit
  when self-claim lands.
- Rounding policy when proportional split produces fractional cents.
- Tech stack specifics (framework, state, storage for optional accounts).
