import { useNavigate, Link } from 'react-router-dom'
import { useStore } from '../store'
import { TabBar } from '../components/TabBar'
import { Avatar } from '../components/Avatar'
import { formatCents } from '../lib/money'
import { subtotalOf } from '../lib/split'

export function Home() {
  const navigate = useNavigate()
  const startNewBill = useStore((s) => s.startNewBill)
  const history = useStore((s) => s.history)
  const friends = useStore((s) => s.friends)

  function snap() {
    startNewBill()
    navigate('/new/capture')
  }
  function manual() {
    startNewBill()
    navigate('/new/review')
  }

  return (
    <>
      <div className="screen has-tabs">
        <div className="topbar">
          <div>
            <div className="sub">Welcome back</div>
            <h1>Split a bill</h1>
          </div>
          <span className="av lg" style={{ backgroundImage: 'var(--grad)' }}>
            🧾
          </span>
        </div>

        <div className="cta-grid">
          <button className="btn" onClick={snap}>
            📷 Snap a receipt
          </button>
          <button className="btn ghost" onClick={manual}>
            ✏️ Enter manually
          </button>
        </div>

        <div className="home-grid">
        <div className="card">
          <div className="row">
            <b className="small">Recent bills</b>
            <Link to="/bills" className="small muted" style={{ textDecoration: 'none' }}>
              See all
            </Link>
          </div>
          {history.length === 0 ? (
            <div className="empty" style={{ padding: '20px 0' }}>
              No bills yet — snap your first receipt 👆
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              {history.slice(0, 3).map((b) => (
                <Link
                  key={b.id}
                  to={`/bill/${b.id}`}
                  className="line"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="row" style={{ gap: 12, justifyContent: 'flex-start' }}>
                    <span
                      className="av md"
                      style={{ background: 'var(--brand-soft)', fontSize: 18 }}
                    >
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
                  </div>
                  <span className="price mono">{formatCents(subtotalOf(b) + b.tax + b.tip)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {friends.length > 0 && (
          <div className="card">
            <div className="row">
              <b className="small">Saved friends</b>
              <Link to="/friends" className="small muted" style={{ textDecoration: 'none' }}>
                Manage
              </Link>
            </div>
            <div className="av-row" style={{ marginTop: 10 }}>
              {friends.slice(0, 8).map((p) => (
                <Avatar key={p.id} person={p} />
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
      <TabBar />
    </>
  )
}
