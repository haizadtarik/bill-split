// Fixed per-friend color palette. A person's colorIndex maps here and stays
// consistent across every screen (assign chips, results, receipt ticks) — the
// core idea of the hybrid design.

export interface FriendColor {
  name: string
  solid: string // avatar / chip background
  soft: string // soft tinted background
  text: string // readable text on soft background
}

export const FRIEND_COLORS: FriendColor[] = [
  { name: 'indigo', solid: '#4f46e5', soft: '#eef0fe', text: '#4f46e5' },
  { name: 'red', solid: '#ef4444', soft: '#fdeced', text: '#dc2626' },
  { name: 'amber', solid: '#f59e0b', soft: '#fef4e3', text: '#b45309' },
  { name: 'sky', solid: '#0ea5e9', soft: '#e7f5fd', text: '#0284c7' },
  { name: 'emerald', solid: '#10b981', soft: '#e6f7f0', text: '#059669' },
  { name: 'pink', solid: '#ec4899', soft: '#fdebf4', text: '#db2777' },
  { name: 'violet', solid: '#8b5cf6', soft: '#f1ecfe', text: '#7c3aed' },
  { name: 'teal', solid: '#14b8a6', soft: '#e4f6f4', text: '#0d9488' },
]

export function colorFor(colorIndex: number): FriendColor {
  return FRIEND_COLORS[colorIndex % FRIEND_COLORS.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0 || parts[0] === '') return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
