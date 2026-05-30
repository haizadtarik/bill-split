// Parser for Donut (CORD-v2) output. Donut emits an XML-ish string describing a
// receipt's structure; we map it onto our ParsedReceipt. Pure + testable, no ML.
//
// Shape (tags may appear in any order / be missing):
//   <s_menu>
//     <s_nm>NAME</s_nm><s_cnt>QTY</s_cnt><s_unitprice>U</s_unitprice><s_price>P</s_price>
//     <sep/> ...next item...
//   </s_menu>
//   <s_sub_total><s_subtotal_price>..</s_subtotal_price><s_tax_price>..</s_tax_price>
//                <s_service_price>..</s_service_price></s_sub_total>
//   <s_total><s_total_price>..</s_total_price></s_total>

import { parseCents } from './money'
import type { ParsedReceipt } from '../types'

/** Value of the first `<s_tag> … (until next tag)`, trimmed, or null. */
function field(src: string, tag: string): string | null {
  const m = src.match(new RegExp(`<s_${tag}>([^<]*)`))
  return m ? m[1].trim() : null
}

/** Content between `<s_tag>` and its closing `</s_tag>` (or end), or ''. */
function section(src: string, tag: string): string {
  const open = `<s_${tag}>`
  const i = src.indexOf(open)
  if (i === -1) return ''
  const rest = src.slice(i + open.length)
  const j = rest.indexOf(`</s_${tag}>`)
  return j === -1 ? rest : rest.slice(0, j)
}

function cleanName(name: string): string {
  return name.replace(/\s{2,}/g, ' ').trim()
}

// A genuine price token: digits with an optional 2-decimal part and thousands
// separators — but NOT things like "Table 7" or "2024-05-28" that Donut
// sometimes mis-files into a price field.
const PRICE_TOKEN = /^\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*$|^\s*\d{1,6}(?:[.,]\d{2})?\s*$/

/** First field among the candidates whose value looks like a real price → cents. */
function priceFrom(chunk: string, tags: string[]): number | null {
  for (const t of tags) {
    const v = field(chunk, t)
    if (v && PRICE_TOKEN.test(v)) {
      const c = parseCents(v)
      if (c != null && c > 0) return c
    }
  }
  return null
}

export function parseDonut(raw: string): ParsedReceipt {
  const items: { name: string; price: number }[] = []

  const menu = section(raw, 'menu')
  for (const chunk of menu.split('<sep/>')) {
    const name = field(chunk, 'nm')
    if (!name) continue
    const price = priceFrom(chunk, ['price', 'num', 'unitprice'])
    if (price == null) continue // header/junk rows have no real price → skip
    items.push({ name: cleanName(name), price })
  }

  const sub = section(raw, 'sub_total')
  const tax = parseCents(field(sub, 'tax_price') ?? '') ?? 0
  // CORD models a "service" charge; treat it as the tip line for our purposes.
  const tip = parseCents(field(sub, 'service_price') ?? '') ?? 0

  return { items, tax: Math.max(0, tax), tip: Math.max(0, tip) }
}
