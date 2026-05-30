// Money helpers. Internally everything is integer cents; these convert at the UI
// edge. Single-currency per the spec — symbol is configurable in one place.

export const CURRENCY_SYMBOL = '$'

/** "$128.14" from 12814 cents. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const rem = (abs % 100).toString().padStart(2, '0')
  return `${sign}${CURRENCY_SYMBOL}${dollars.toLocaleString()}.${rem}`
}

/** Parse a free-text price like "12", "12.5", "$12.50" into cents, or null. */
export function parseCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '')
  if (cleaned === '' || cleaned === '.') return null
  const value = Number.parseFloat(cleaned)
  if (Number.isNaN(value)) return null
  return Math.round(value * 100)
}
