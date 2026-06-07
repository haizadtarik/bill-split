import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { computeSplit } from '../lib/split'
import { colorFor } from '../lib/colors'
import { formatCents } from '../lib/money'
import type { Bill } from '../types'

function buildShareText(bill: Bill): string {
  const split = computeSplit(bill)
  const payer = bill.people.find((p) => p.id === bill.paidBy)
  const lines = [`🧾 ${bill.title} — split with SplitBill`, '']
  for (const s of split.shares) {
    const tag = s.person.id === bill.paidBy ? ' (paid)' : ''
    const what = s.items.length ? ` — ${s.items.join(', ')}` : ''
    lines.push(`${s.person.name}${tag}: ${formatCents(s.total)}${what}`)
  }
  lines.push('', `Total: ${formatCents(split.grandTotal)}`)
  if (payer) {
    const others = split.shares.filter((s) => s.person.id !== bill.paidBy)
    if (others.length)
      lines.push(`${others.map((o) => o.person.name).join(', ')} → owe ${payer.name}.`)
  }
  return lines.join('\n')
}

export function Results() {
  const { id } = useParams()
  const navigate = useNavigate()
  const history = useStore((s) => s.history)
  const setSavedPaidBy = useStore((s) => s.setSavedPaidBy)
  const bill = useMemo(() => history.find((b) => b.id === id), [history, id])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!bill) navigate('/', { replace: true })
  }, [bill, navigate])
  if (!bill) return null

  const split = computeSplit(bill)
  const owed = split.shares
    .filter((s) => s.person.id !== bill.paidBy)
    .reduce((sum, s) => sum + s.total, 0)
  const owersCount = split.shares.filter((s) => s.person.id !== bill.paidBy).length
  const payer = bill.people.find((p) => p.id === bill.paidBy)

  async function share() {
    const text = buildShareText(bill!)
    try {
      if (navigator.share) {
        await navigator.share({ title: bill!.title, text })
        return
      }
    } catch {
      /* user cancelled or unsupported — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="screen has-cta">
      <div className="topbar">
        <button className="iconbtn" onClick={() => navigate('/')}>
          ‹
        </button>
        <h1 style={{ fontSize: 17 }}>The split</h1>
        <button className="iconbtn" onClick={share}>
          ⤴
        </button>
      </div>

      {/* summary */}
      <div className="card center">
        <div className="small muted">
          {payer ? (payer.name === 'You' ? 'You are owed' : `${payer.name} is owed`) : 'Total'}
        </div>
        <div className="amount" style={{ color: 'var(--green)' }}>
          {formatCents(owed)}
        </div>
        <div className="small muted">
          from {owersCount} {owersCount === 1 ? 'person' : 'people'} · {bill.title}
        </div>
      </div>

      {/* who paid */}
      <div className="card row">
        <span className="small muted">Paid by</span>
        <select
          className="field"
          style={{ width: 'auto', padding: '8px 10px' }}
          value={bill.paidBy ?? ''}
          onChange={(e) => setSavedPaidBy(bill.id, e.target.value)}
        >
          {bill.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* receipt flourish */}
      <div className="receipt">
        <div className="center">
          <div className="brand">SPLITBILL</div>
          <div className="rsub">
            {bill.title.toUpperCase()} · {bill.people.length} GUESTS ·{' '}
            {new Date(bill.createdAt)
              .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              .toUpperCase()}
          </div>
        </div>
        <div className="rdash" />
        {/* itemised bill under each person, including their tax + tip share */}
        {split.shares.map((s) => {
          const c = colorFor(s.person.colorIndex)
          const isPayer = s.person.id === bill.paidBy
          return (
            <div key={s.person.id} className="rperson">
              <div className="rrow">
                <span className="rwho">
                  <span className="tick" style={{ background: c.solid }} />
                  {s.person.name}
                  {isPayer && <span className="paid">PAID</span>}
                </span>
                <span className="mono" style={{ fontWeight: 700 }}>
                  {formatCents(s.total)}
                </span>
              </div>
              {s.lineItems.map((li, i) => (
                <div className="rrow ritem" key={i}>
                  <span>{li.name}</span>
                  <span className="mono">{formatCents(li.amount)}</span>
                </div>
              ))}
              {s.taxTip > 0 && (
                <div className="rrow ritem">
                  <span>Tax + tip</span>
                  <span className="mono">{formatCents(s.taxTip)}</span>
                </div>
              )}
            </div>
          )
        })}
        <div className="rdash" />
        <div className="rrow rsub">
          <span>SUBTOTAL</span>
          <span className="mono">{formatCents(split.subtotal)}</span>
        </div>
        <div className="rrow rsub">
          <span>TAX + TIP (proportional)</span>
          <span className="mono">{formatCents(split.tax + split.tip)}</span>
        </div>
        <div className="rrow rtotal" style={{ marginTop: 6 }}>
          <span>TOTAL</span>
          <span className="mono">{formatCents(split.grandTotal)}</span>
        </div>
        <div className="barcode" />
        <div className="center rsub" style={{ paddingBottom: 6 }}>
          THANK YOU · SETTLE UP ANY WAY YOU LIKE
        </div>
      </div>

      <div className="cta-bar">
        <button className="btn" onClick={share}>
          {copied ? '✓ Copied to clipboard' : '📤 Share split'}
        </button>
      </div>
    </div>
  )
}
