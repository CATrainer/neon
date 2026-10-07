import { data } from '../fixtures'

const NOW_MS = Date.parse(data.now)

/** "3h", "2d", "just now" — short enough for a dense row. */
export function rel(iso: string): string {
  const diff = NOW_MS - Date.parse(iso)
  const abs = Math.abs(diff)
  const min = Math.round(abs / 60_000)
  const suffix = diff < 0 ? 'in ' : ''
  const trail = diff < 0 ? '' : ''
  if (min < 1) return 'just now'
  if (min < 60) return `${suffix}${min}m${trail}`
  const h = Math.round(min / 60)
  if (h < 36) return `${suffix}${h}h${trail}`
  const d = Math.round(h / 24)
  if (d < 60) return `${suffix}${d}d${trail}`
  return `${suffix}${Math.round(d / 30)}mo${trail}`
}

export function relLong(iso: string): string {
  const diff = NOW_MS - Date.parse(iso)
  const s = rel(iso)
  if (s === 'just now') return s
  return diff < 0 ? `${s} from now` : `${s} ago`
}

export function absolute(iso: string): string {
  const d = new Date(iso)
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function initials(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : ''
  return (first + last).toUpperCase()
}

export function signed(n: number, digits = 3): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`
}
