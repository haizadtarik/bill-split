// Tiny localStorage-backed persistence. Per the spec, bills are ephemeral but
// signed-out users still get a local history + saved friends on their own device
// (the "logged-in convenience" works offline-first here). No backend needed.

import type { Bill, Person } from '../types'

const HISTORY_KEY = 'splitbill.history.v1'
const FRIENDS_KEY = 'splitbill.friends.v1'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota / privacy mode — fail silently, app still works in-session
  }
}

export function loadHistory(): Bill[] {
  return read<Bill[]>(HISTORY_KEY, []).sort((a, b) => b.createdAt - a.createdAt)
}

export function saveBillToHistory(bill: Bill): void {
  const all = read<Bill[]>(HISTORY_KEY, [])
  const next = [bill, ...all.filter((b) => b.id !== bill.id)].slice(0, 100)
  write(HISTORY_KEY, next)
}

export function deleteBillFromHistory(id: string): void {
  write(
    HISTORY_KEY,
    read<Bill[]>(HISTORY_KEY, []).filter((b) => b.id !== id),
  )
}

export function loadFriends(): Person[] {
  return read<Person[]>(FRIENDS_KEY, [])
}

/** Upsert people into the saved-friends roster (matched by case-insensitive name). */
export function rememberFriends(people: Person[]): void {
  const existing = read<Person[]>(FRIENDS_KEY, [])
  const byName = new Map(existing.map((p) => [p.name.toLowerCase(), p]))
  for (const p of people) {
    const key = p.name.trim().toLowerCase()
    if (!key) continue
    if (!byName.has(key)) byName.set(key, p)
  }
  write(FRIENDS_KEY, Array.from(byName.values()))
}

export function removeFriend(id: string): void {
  write(
    FRIENDS_KEY,
    read<Person[]>(FRIENDS_KEY, []).filter((p) => p.id !== id),
  )
}
