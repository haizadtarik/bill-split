export function uid(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 9)
  return `${prefix}${Date.now().toString(36)}${rand}`
}
