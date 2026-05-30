import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/bills', icon: '🧾', label: 'Bills' },
  { to: '/friends', icon: '👥', label: 'Friends' },
]

export function TabBar() {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
          <span className="ico">{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}
