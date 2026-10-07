import { describe, expect, it } from 'vitest'
import { DEFAULT_IDEA_TTL_DAYS, daysUntilExpiry, expiryFor, isExpired } from './ideas.js'

const captured = new Date('2026-06-01T00:00:00.000Z')

describe('idea expiry', () => {
  it('defaults to 60 days from capture', () => {
    expect(DEFAULT_IDEA_TTL_DAYS).toBe(60)
    expect(expiryFor(captured).toISOString()).toBe('2026-07-31T00:00:00.000Z')
  })

  it('honours a configured ttl', () => {
    expect(expiryFor(captured, 7).toISOString()).toBe('2026-06-08T00:00:00.000Z')
  })

  it('expires on the boundary, not after it', () => {
    const expires = expiryFor(captured, 1)
    expect(isExpired(expires, new Date('2026-06-02T00:00:00.000Z'))).toBe(true)
    expect(isExpired(expires, new Date('2026-06-01T23:59:59.000Z'))).toBe(false)
  })

  it('counts down so ageing ideas can be surfaced before they go', () => {
    const expires = expiryFor(captured)
    expect(daysUntilExpiry(expires, new Date('2026-07-26T00:00:00.000Z'))).toBe(5)
    expect(daysUntilExpiry(expires, new Date('2026-08-05T00:00:00.000Z'))).toBeLessThan(0)
  })
})
