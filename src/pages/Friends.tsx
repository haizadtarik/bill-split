import { useStore } from '../store'
import { TabBar } from '../components/TabBar'
import { Avatar } from '../components/Avatar'

export function Friends() {
  const friends = useStore((s) => s.friends)
  const deleteFriend = useStore((s) => s.deleteFriend)

  return (
    <>
      <div className="screen has-tabs">
        <div className="topbar">
          <h1>Friends</h1>
        </div>
        <div className="banner info">
          💡 Friends are saved automatically from your bills, so you don't retype names. They live
          on this device only.
        </div>

        {friends.length === 0 ? (
          <div className="empty">
            <div className="big">👥</div>
            No saved friends yet.
            <div className="small" style={{ marginTop: 10 }}>
              Add people while assigning a bill and they'll show up here.
            </div>
          </div>
        ) : (
          <div className="card">
            {friends.map((p) => (
              <div className="line" key={p.id}>
                <div className="row" style={{ gap: 12, justifyContent: 'flex-start' }}>
                  <Avatar person={p} />
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                </div>
                <button
                  className="iconbtn"
                  style={{ boxShadow: 'none', color: 'var(--muted)' }}
                  onClick={() => deleteFriend(p.id)}
                  aria-label={`remove ${p.name}`}
                >
                  ✕
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
