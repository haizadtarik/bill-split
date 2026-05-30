import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { formatCents, parseCents } from '../lib/money'
import { subtotalOf } from '../lib/split'

function centsToInput(cents: number): string {
  return cents === 0 ? '' : (cents / 100).toFixed(2)
}

export function Review() {
  const navigate = useNavigate()
  const draft = useStore((s) => s.draft)
  const { setTitle, addItem, updateItem, removeItem, setTax, setTip } = useStore.getState()

  useEffect(() => {
    if (!draft) navigate('/', { replace: true })
  }, [draft, navigate])
  if (!draft) return null

  const subtotal = subtotalOf(draft)
  const total = subtotal + draft.tax + draft.tip
  const canProceed = draft.items.length > 0 && draft.items.every((i) => i.price > 0)

  const tipPct = (pct: number) => setTip(Math.round(subtotal * pct))

  return (
    <div className="screen has-cta">
      <div className="topbar">
        <button className="iconbtn" onClick={() => navigate('/')}>
          ‹
        </button>
        <h1 style={{ fontSize: 17 }}>Review items</h1>
        <button className="iconbtn" onClick={() => addItem()}>
          ＋
        </button>
      </div>

      <div className="card row" style={{ gap: 12 }}>
        <span className="av lg" style={{ background: 'var(--brand-soft)', fontSize: 22 }}>
          {draft.emoji}
        </span>
        <input
          className="field"
          placeholder="Bill name (e.g. Taverna 14)"
          defaultValue={draft.title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="card">
        {draft.items.length === 0 ? (
          <div className="empty" style={{ padding: '24px 0' }}>
            <div className="big">🍽️</div>
            No items yet.
            <div className="small" style={{ marginTop: 8 }}>
              Tap ＋ above to add your first one.
            </div>
          </div>
        ) : (
          draft.items.map((it) => (
            <div className="line" key={it.id}>
              <input
                className="field"
                style={{ flex: 1, border: 'none', background: 'transparent', padding: '4px 0' }}
                placeholder="Item name"
                defaultValue={it.name}
                onChange={(e) => updateItem(it.id, { name: e.target.value })}
              />
              <input
                className="field price-input"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={centsToInput(it.price)}
                onChange={(e) => updateItem(it.id, { price: parseCents(e.target.value) ?? 0 })}
              />
              <button
                className="iconbtn"
                style={{ boxShadow: 'none', color: 'var(--muted)' }}
                onClick={() => removeItem(it.id)}
                aria-label="remove"
              >
                ✕
              </button>
            </div>
          ))
        )}
        <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => addItem()}>
          ＋ Add item
        </button>
      </div>

      <div className="card col">
        <div className="row">
          <span className="muted">Tax</span>
          <input
            className="field price-input"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={centsToInput(draft.tax)}
            onChange={(e) => setTax(parseCents(e.target.value) ?? 0)}
          />
        </div>
        <div className="row">
          <span className="muted">Tip</span>
          <input
            className="field price-input"
            inputMode="decimal"
            placeholder="0.00"
            key={draft.tip /* re-sync when % buttons change it */}
            defaultValue={centsToInput(draft.tip)}
            onChange={(e) => setTip(parseCents(e.target.value) ?? 0)}
          />
        </div>
        <div className="chips">
          {[0.15, 0.18, 0.2].map((p) => (
            <button key={p} className="chip" onClick={() => tipPct(p)}>
              Tip {Math.round(p * 100)}%
            </button>
          ))}
        </div>
        <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <span className="muted small">Subtotal</span>
          <span className="mono small">{formatCents(subtotal)}</span>
        </div>
        <div className="row">
          <b>Total</b>
          <b className="price mono">{formatCents(total)}</b>
        </div>
      </div>

      <div className="cta-bar">
        <button className="btn" disabled={!canProceed} onClick={() => navigate('/new/assign')}>
          Assign items →
        </button>
      </div>
    </div>
  )
}
