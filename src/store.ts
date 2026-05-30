import { create } from 'zustand'
import type { Bill, LineItem, Person } from './types'
import { uid } from './lib/id'
import {
  loadFriends,
  loadHistory,
  rememberFriends,
  removeFriend,
  saveBillToHistory,
  deleteBillFromHistory,
} from './lib/storage'

const EMOJIS = ['🍝', '🍣', '🍔', '🍕', '🌮', '🍜', '🥗', '🍤', '🥘', '☕️', '🍻']

function randomEmoji(): string {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
}

interface ParsedReceipt {
  title?: string
  items: { name: string; price: number }[]
  tax: number
  tip: number
}

interface StoreState {
  draft: Bill | null
  history: Bill[]
  friends: Person[]

  // lifecycle
  refresh: () => void
  startNewBill: () => void
  loadParsedReceipt: (parsed: ParsedReceipt) => void
  finalize: () => Bill | null
  discardDraft: () => void

  // bill meta
  setTitle: (title: string) => void
  setTax: (cents: number) => void
  setTip: (cents: number) => void
  setPaidBy: (personId: string) => void

  // items
  addItem: (name?: string, price?: number) => string
  updateItem: (id: string, patch: Partial<Pick<LineItem, 'name' | 'price'>>) => void
  removeItem: (id: string) => void

  // people
  addPerson: (name: string) => string
  removePerson: (id: string) => void
  renamePerson: (id: string, name: string) => void

  // assignment
  toggleAssignment: (itemId: string, personId: string) => void
  assignItemToOnly: (itemId: string, personId: string) => void
  splitAllEvenly: () => void
  clearAllAssignments: () => void

  // friends roster
  deleteFriend: (id: string) => void

  // saved bills
  setSavedPaidBy: (billId: string, personId: string) => void
  removeSavedBill: (billId: string) => void
}

function patchDraft(draft: Bill, fn: (b: Bill) => void): Bill {
  const next: Bill = {
    ...draft,
    people: draft.people.map((p) => ({ ...p })),
    items: draft.items.map((it) => ({ ...it, assignedTo: [...it.assignedTo] })),
  }
  fn(next)
  return next
}

export const useStore = create<StoreState>((set, get) => ({
  draft: null,
  history: loadHistory(),
  friends: loadFriends(),

  refresh: () => set({ history: loadHistory(), friends: loadFriends() }),

  startNewBill: () => {
    // seed the organizer ("You") + any previously-saved friends as quick picks
    const you: Person = { id: uid('p_'), name: 'You', colorIndex: 0 }
    set({
      draft: {
        id: uid('b_'),
        title: '',
        emoji: randomEmoji(),
        createdAt: Date.now(),
        people: [you],
        items: [],
        tax: 0,
        tip: 0,
        paidBy: you.id,
      },
    })
  },

  loadParsedReceipt: (parsed) => {
    const draft = get().draft
    if (!draft) return
    set({
      draft: patchDraft(draft, (b) => {
        if (parsed.title && !b.title) b.title = parsed.title
        b.items = parsed.items.map((it) => ({
          id: uid('i_'),
          name: it.name,
          price: it.price,
          assignedTo: [],
        }))
        b.tax = parsed.tax
        b.tip = parsed.tip
      }),
    })
  },

  finalize: () => {
    const draft = get().draft
    if (!draft) return null
    const title = draft.title.trim() || 'Untitled bill'
    const finalBill: Bill = { ...draft, title, createdAt: Date.now() }
    saveBillToHistory(finalBill)
    // remember everyone except the organizer ("You")
    rememberFriends(finalBill.people.filter((p) => p.name.toLowerCase() !== 'you'))
    set({ draft: null, history: loadHistory(), friends: loadFriends() })
    return finalBill
  },

  discardDraft: () => set({ draft: null }),

  setTitle: (title) => {
    const d = get().draft
    if (d) set({ draft: patchDraft(d, (b) => (b.title = title)) })
  },
  setTax: (cents) => {
    const d = get().draft
    if (d) set({ draft: patchDraft(d, (b) => (b.tax = Math.max(0, cents))) })
  },
  setTip: (cents) => {
    const d = get().draft
    if (d) set({ draft: patchDraft(d, (b) => (b.tip = Math.max(0, cents))) })
  },
  setPaidBy: (personId) => {
    const d = get().draft
    if (d) set({ draft: patchDraft(d, (b) => (b.paidBy = personId)) })
  },

  addItem: (name = '', price = 0) => {
    const d = get().draft
    const id = uid('i_')
    if (d)
      set({
        draft: patchDraft(d, (b) =>
          b.items.push({ id, name, price, assignedTo: [] }),
        ),
      })
    return id
  },
  updateItem: (id, patch) => {
    const d = get().draft
    if (d)
      set({
        draft: patchDraft(d, (b) => {
          const it = b.items.find((x) => x.id === id)
          if (it) Object.assign(it, patch)
        }),
      })
  },
  removeItem: (id) => {
    const d = get().draft
    if (d)
      set({ draft: patchDraft(d, (b) => (b.items = b.items.filter((x) => x.id !== id))) })
  },

  addPerson: (name) => {
    const d = get().draft
    const id = uid('p_')
    if (d)
      set({
        draft: patchDraft(d, (b) =>
          b.people.push({ id, name: name.trim() || 'Friend', colorIndex: b.people.length }),
        ),
      })
    return id
  },
  removePerson: (id) => {
    const d = get().draft
    if (d)
      set({
        draft: patchDraft(d, (b) => {
          b.people = b.people.filter((p) => p.id !== id)
          b.items.forEach((it) => {
            it.assignedTo = it.assignedTo.filter((pid) => pid !== id)
          })
          if (b.paidBy === id) b.paidBy = b.people[0]?.id ?? null
        }),
      })
  },
  renamePerson: (id, name) => {
    const d = get().draft
    if (d)
      set({
        draft: patchDraft(d, (b) => {
          const p = b.people.find((x) => x.id === id)
          if (p) p.name = name
        }),
      })
  },

  toggleAssignment: (itemId, personId) => {
    const d = get().draft
    if (d)
      set({
        draft: patchDraft(d, (b) => {
          const it = b.items.find((x) => x.id === itemId)
          if (!it) return
          it.assignedTo = it.assignedTo.includes(personId)
            ? it.assignedTo.filter((pid) => pid !== personId)
            : [...it.assignedTo, personId]
        }),
      })
  },
  assignItemToOnly: (itemId, personId) => {
    const d = get().draft
    if (d)
      set({
        draft: patchDraft(d, (b) => {
          const it = b.items.find((x) => x.id === itemId)
          if (it) it.assignedTo = [personId]
        }),
      })
  },
  splitAllEvenly: () => {
    const d = get().draft
    if (d)
      set({
        draft: patchDraft(d, (b) => {
          const everyone = b.people.map((p) => p.id)
          b.items.forEach((it) => (it.assignedTo = [...everyone]))
        }),
      })
  },
  clearAllAssignments: () => {
    const d = get().draft
    if (d)
      set({
        draft: patchDraft(d, (b) => b.items.forEach((it) => (it.assignedTo = []))),
      })
  },

  deleteFriend: (id) => {
    removeFriend(id)
    set({ friends: loadFriends() })
  },

  setSavedPaidBy: (billId, personId) => {
    const bill = get().history.find((b) => b.id === billId)
    if (!bill) return
    saveBillToHistory({ ...bill, paidBy: personId })
    set({ history: loadHistory() })
  },
  removeSavedBill: (billId) => {
    deleteBillFromHistory(billId)
    set({ history: loadHistory() })
  },
}))
