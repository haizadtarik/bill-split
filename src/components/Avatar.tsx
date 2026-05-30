import type { Person } from '../types'
import { colorFor, initials } from '../lib/colors'

interface Props {
  person: Person
  size?: 'sm' | 'md' | 'lg'
  off?: boolean
  onClick?: () => void
}

export function Avatar({ person, size = 'md', off = false, onClick }: Props) {
  const c = colorFor(person.colorIndex)
  return (
    <span
      className={`av ${size}${off ? ' off' : ''}`}
      style={{ background: c.solid }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={person.name}
    >
      {initials(person.name)}
    </span>
  )
}
