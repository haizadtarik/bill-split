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
