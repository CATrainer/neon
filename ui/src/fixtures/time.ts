import type { ISODateTime } from './types'

/**
 * The fixture pins "now" so relative timestamps render identically on every
 * load. Nothing in the fixture module may read the system clock.
 */
export const NOW = '2026-08-08T14:20:00.000Z'

const NOW_MS = Date.parse(NOW)

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export function ago(opts: {
  d?: number
  h?: number
  m?: number
}): ISODateTime {
  const ms =
    (opts.d ?? 0) * DAY + (opts.h ?? 0) * HOUR + (opts.m ?? 0) * MIN
  return new Date(NOW_MS - ms).toISOString()
}

export function ahead(opts: {
  d?: number
  h?: number
  m?: number
}): ISODateTime {
  const ms =
    (opts.d ?? 0) * DAY + (opts.h ?? 0) * HOUR + (opts.m ?? 0) * MIN
  return new Date(NOW_MS + ms).toISOString()
}

export function plus(from: ISODateTime, opts: { h?: number; m?: number; s?: number }): ISODateTime {
  const ms =
    (opts.h ?? 0) * HOUR + (opts.m ?? 0) * MIN + (opts.s ?? 0) * 1000
  return new Date(Date.parse(from) + ms).toISOString()
}

/** Deterministic PRNG — used only to bulk out run history. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x1_0000_0000
  }
}
