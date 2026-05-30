import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { TabBar } from '../components/TabBar'
import { formatCents } from '../lib/money'
import { subtotalOf } from '../lib/split'

export function Bills() {
  const navigate = useNavigate()
  const history = useStore((s) => s.history)
  const removeSavedBill = useStore((s) => s.removeSavedBill)
  const startNewBill = useStore((s) => s.startNewBill)

  return (
    <>
      <div className="screen has-tabs">
        <div className="topbar">
          <h1>Bills</h1>
          <button
            className="iconbtn"
            onClick={() => {
              startNewBill()
              navigate('/new/capture')
            }}
          >
            ＋
          </button>
        </div>

        {history.length === 0 ? (
          <div className="empty">
            <div className="big">🧾</div>
            No saved bills yet.
            <div className="small" style={{ marginTop: 10 }}>
              Your past splits live here — on this device.
            </div>
          </div>
        ) : (
          <div className="card">
            {history.map((b) => (
              <div className="line" key={b.id}>
                <Link
                  to={`/bill/${b.id}`}
                  className="row"
                  style={{ gap: 12, justifyContent: 'flex-start', flex: 1, textDecoration: 'none', color: 'inherit' }}
                >
                  <span className="av md" style={{ background: 'var(--brand-soft)', fontSize: 18 }}>
                    {b.emoji}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{b.title}</div>
                    <div className="small muted">
                      {b.people.length} people ·{' '}
                      {new Date(b.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                </Link>
                <span className="price mono">{formatCents(subtotalOf(b) + b.tax + b.tip)}</span>
                <button
                  className="iconbtn"
                  style={{ boxShadow: 'none', color: 'var(--muted)' }}
                  onClick={() => removeSavedBill(b.id)}
                  aria-label="delete bill"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <TabBar />
    </>
  )
}
