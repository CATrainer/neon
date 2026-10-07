/**
 * Idea expiry.
 *
 * Ideas expire silently after a configurable period untouched. Expiry requires
 * no action from anyone and notifies nobody: a funnel where every entry must be
 * resolved is one people stop using.
 */

export const DEFAULT_IDEA_TTL_DAYS = 60

const DAY_MS = 24 * 60 * 60 * 1000

export function expiryFor(touchedAt: Date, ttlDays: number = DEFAULT_IDEA_TTL_DAYS): Date {
  return new Date(touchedAt.getTime() + ttlDays * DAY_MS)
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime()
}

/** Days until expiry, negative once past. Used to surface ageing ideas as
 *  generative material before they quietly go. */
export function daysUntilExpiry(expiresAt: Date, now: Date): number {
  return (expiresAt.getTime() - now.getTime()) / DAY_MS
}
