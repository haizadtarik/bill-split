import type { Bill, SplitResult, PersonShare } from '../types'

/**
 * Distribute an integer `amount` of cents across buckets weighted by `weights`,
 * returning integers that sum to EXACTLY `amount`. Uses the largest-remainder
 * (Hamilton) method, so the unavoidable leftover pennies go to the buckets with
 * the biggest fractional parts — fair and fully reconciled, no money invented or
 * lost. If all weights are zero, the amount is spread as evenly as possible.
 */
export function distribute(amount: number, weights: number[]): number[] {
  const n = weights.length
  if (n === 0) return []
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const useEqual = totalWeight <= 0
  const exact = weights.map((w) =>
    useEqual ? amount / n : (amount * w) / totalWeight,
  )
  const floors = exact.map(Math.floor)
  let remainder = amount - floors.reduce((a, b) => a + b, 0)
  // hand out the leftover cents to the largest fractional parts
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  const result = [...floors]
  for (let k = 0; k < remainder && k < n; k++) result[order[k].i] += 1
  return result
}

/** Sum of all item prices (each item counted once). */
export function subtotalOf(bill: Bill): number {
  return bill.items.reduce((sum, it) => sum + it.price, 0)
}

/** Cents assigned to no one yet. */
export function unassignedOf(bill: Bill): number {
  return bill.items
    .filter((it) => it.assignedTo.length === 0)
    .reduce((sum, it) => sum + it.price, 0)
}

function shortName(name: string): string {
  return name.trim().split(/\s+/)[0].toLowerCase()
}

/**
 * Compute each person's share. Each item's price is split equally (cent-exact)
 * among the people assigned to it. Tax and tip are then allocated to each person
 * in proportion to their item subtotal. Everything reconciles to the penny.
 */
export function computeSplit(bill: Bill): SplitResult {
  const people = bill.people
  const idx = new Map(people.map((p, i) => [p.id, i]))
  const subtotals = new Array(people.length).fill(0)
  const itemsPer: string[][] = people.map(() => [])

  for (const item of bill.items) {
    if (item.assignedTo.length === 0) continue
    // split this item's price equally across its assignees, cent-exact
    const parts = distribute(
      item.price,
      item.assignedTo.map(() => 1),
    )
    item.assignedTo.forEach((pid, j) => {
      const i = idx.get(pid)
      if (i === undefined) return
      subtotals[i] += parts[j]
      itemsPer[i].push(shortName(item.name))
    })
  }

  const subtotal = subtotalOf(bill)
  const taxTipPool = bill.tax + bill.tip
  // allocate tax+tip proportional to each person's subtotal
  const taxTips = distribute(taxTipPool, subtotals)

  const shares: PersonShare[] = people.map((person, i) => ({
    person,
    subtotal: subtotals[i],
    taxTip: taxTips[i],
    total: subtotals[i] + taxTips[i],
    items: dedupe(itemsPer[i]),
  }))

  return {
    shares,
    subtotal,
    tax: bill.tax,
    tip: bill.tip,
    grandTotal: subtotal + taxTipPool,
    unassigned: unassignedOf(bill),
  }
}

function dedupe(xs: string[]): string[] {
  return Array.from(new Set(xs))
}
