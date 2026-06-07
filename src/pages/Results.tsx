import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toBlob } from 'html-to-image'
import { useStore } from '../store'
import { computeSplit } from '../lib/split'
import { colorFor } from '../lib/colors'
import { formatCents } from '../lib/money'
import type { Bill } from '../types'

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'splitbill'
  )
}

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
  const [imaging, setImaging] = useState(false)
  const receiptRef = useRef<HTMLDivElement>(null)

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

  // Render the receipt to a PNG and share it as a file (with a download fallback).
  async function shareImage() {
    const node = receiptRef.current
    if (!node || imaging) return
    setImaging(true)
    // html-to-image doesn't paint the capture root's own background, so fill the
    // canvas with the receipt's paper color — a clean full-bleed paper receipt.
    const paper = getComputedStyle(node).getPropertyValue('--paper').trim() || '#f6f1e7'
    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: paper,
      })
      if (!blob) return
      const file = new File([blob], `${slugify(bill!.title)}-split.png`, {
        type: 'image/png',
      })
      const canShareFiles =
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
      if (navigator.share && canShareFiles) {
        try {
          await navigator.share({ files: [file], title: bill!.title })
          return
        } catch (err) {
          // user dismissed the share sheet — don't force a download
          if (err instanceof Error && err.name === 'AbortError') return
          /* real failure — fall through to download */
        }
      }
      // fallback: trigger a download of the PNG
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setImaging(false)
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
      <div className="receipt" ref={receiptRef}>
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
        <button className="btn" onClick={shareImage} disabled={imaging}>
          {imaging ? '… Rendering receipt' : '🧾 Share as image'}
        </button>
        <button className="btn ghost" onClick={share}>
          {copied ? '✓ Copied to clipboard' : '📤 Share as text'}
        </button>
      </div>
    </div>
  )
}
