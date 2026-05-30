import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { Avatar } from '../components/Avatar'
import { colorFor } from '../lib/colors'
import { formatCents } from '../lib/money'
import { distribute } from '../lib/split'

export function Assign() {
  const navigate = useNavigate()
  const draft = useStore((s) => s.draft)
  const {
    toggleAssignment,
    addPerson,
    removePerson,
    splitAllEvenly,
    clearAllAssignments,
    finalize,
  } = useStore.getState()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (!draft) navigate('/', { replace: true })
  }, [draft, navigate])
  if (!draft) return null

  const everyoneAssigned = draft.items.every((it) => it.assignedTo.length > 0)
  const assignedCount = draft.items.filter((it) => it.assignedTo.length > 0).length

  function commitAdd() {
    const n = name.trim()
    if (n) addPerson(n)
    setName('')
    setAdding(false)
  }

  function finishUp() {
    const bill = finalize()
    if (bill) navigate(`/bill/${bill.id}`, { replace: true })
  }

  return (
    <div className="screen has-cta">
      <div className="topbar">
        <button className="iconbtn" onClick={() => navigate('/new/review')}>
          ‹
        </button>
        <h1 style={{ fontSize: 17 }}>Who had what?</h1>
        <span className="iconbtn small mono" style={{ fontSize: 12 }}>
          {assignedCount}/{draft.items.length}
        </span>
      </div>

      {/* diners */}
      <div className="card">
        <div className="row">
          <b className="small">Diners</b>
          <span className="small muted">Tap names on each item</span>
        </div>
        <div className="av-row" style={{ marginTop: 10 }}>
          {draft.people.map((p) => (
            <span key={p.id} style={{ position: 'relative' }}>
              <Avatar person={p} />
              {p.name.toLowerCase() !== 'you' && (
                <button
                  onClick={() => removePerson(p.id)}
                  aria-label={`remove ${p.name}`}
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: 'var(--shadow)',
                    fontSize: 10,
                    lineHeight: '16px',
                    color: 'var(--muted)',
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {adding ? (
            <input
              className="field"
              style={{ width: 130 }}
              autoFocus
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitAdd}
              onKeyDown={(e) => e.key === 'Enter' && commitAdd()}
            />
          ) : (
            <span className="av md add" role="button" onClick={() => setAdding(true)}>
              ＋
            </span>
          )}
        </div>
      </div>

      {/* quick actions */}
      <div className="seg">
        <button className="on" onClick={clearAllAssignments}>
          Tap to assign
        </button>
        <button onClick={splitAllEvenly}>Split everything evenly</button>
      </div>

      {/* items */}
      <div className="card col" style={{ gap: 0 }}>
        {draft.items.map((it) => {
          const n = it.assignedTo.length
          const per = n > 0 ? distribute(it.price, it.assignedTo.map(() => 1))[0] : 0
          return (
            <div key={it.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="row">
                <span style={{ fontWeight: 600 }}>{it.name || 'Item'}</span>
                <span className="price mono">{formatCents(it.price)}</span>
              </div>
              <div className="chips" style={{ marginTop: 8 }}>
                {draft.people.map((p) => {
                  const on = it.assignedTo.includes(p.id)
                  const c = colorFor(p.colorIndex)
                  return (
                    <button
                      key={p.id}
                      className="chip"
                      onClick={() => toggleAssignment(it.id, p.id)}
                      style={
                        on
                          ? { background: c.solid, color: '#fff', borderColor: 'transparent' }
                          : undefined
                      }
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
              {n > 1 && (
                <div className="small" style={{ marginTop: 8, color: 'var(--brand)', fontWeight: 600 }}>
                  ↔ Split {n} ways · {formatCents(per)} each
                </div>
              )}
              {n === 0 && (
                <div className="small" style={{ marginTop: 8, color: 'var(--danger)' }}>
                  Unassigned — tap who had it
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="cta-bar">
        {!everyoneAssigned && (
          <div className="banner warn" style={{ marginBottom: 10 }}>
            ⚠️ Assign every item before splitting.
          </div>
        )}
        <button className="btn" disabled={!everyoneAssigned} onClick={finishUp}>
          See the split →
        </button>
      </div>
    </div>
  )
}
