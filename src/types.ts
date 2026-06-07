// Core domain types for SplitBill.
// Money is stored in integer **cents** everywhere to avoid float drift.
// Conversion to/from dollars happens only at the UI edge.

export interface Person {
  id: string
  name: string
  /** index into the fixed friend-color palette (see lib/colors) */
  colorIndex: number
}

export interface LineItem {
  id: string
  name: string
  /** price in cents */
  price: number
  /** ids of people this item is split among. empty = unassigned */
  assignedTo: string[]
}

export interface Bill {
  id: string
  title: string
  /** emoji shown in history */
  emoji: string
  createdAt: number
  people: Person[]
  items: LineItem[]
  /** tax in cents (as printed on the receipt) */
  tax: number
  /** tip in cents */
  tip: number
  /** id of the person who paid (the organizer). null until chosen */
  paidBy: string | null
}

/** What a single person ends up owing, after proportional tax+tip. */
export interface PersonShare {
  person: Person
  /** their share of item subtotals, cents */
  subtotal: number
  /** their allocated portion of tax+tip, cents */
  taxTip: number
  /** subtotal + taxTip, cents */
  total: number
  /** short human summary of what they had, e.g. "pizza + wine" */
  items: string[]
  /** per-item breakdown of what this person pays, with their cent share of each */
  lineItems: { name: string; amount: number }[]
}

/** Structured receipt produced by the OCR pipeline (prices in cents). */
export interface ParsedReceipt {
  title?: string
  items: { name: string; price: number }[]
  tax: number
  tip: number
}

export interface SplitResult {
  shares: PersonShare[]
  subtotal: number
  tax: number
  tip: number
  grandTotal: number
  /** cents assigned to nobody yet — should be 0 before settling */
  unassigned: number
}
