import { describe, expect, it } from 'vitest'
import { directoriesFor, renderRule } from './generate.js'

describe('where a rule belongs', () => {
  it('uses the directory the glob is rooted in', () => {
    expect(directoriesFor(['src/ingest/**'])).toEqual(['src/ingest'])
  })

  it('places one rule per glob root rather than hoisting to their ancestor', () => {
    // Hoisting `src/retrieval/**` and `src/rank/**` to `src/` would put the
    // constraint in front of everyone working anywhere under it — the failure
    // mode path-scoping exists to avoid.
    expect(directoriesFor(['src/retrieval/**', 'src/rank/**'])).toEqual([
      'src/retrieval',
      'src/rank',
    ])
  })

  it('collapses globs that share a root', () => {
    expect(directoriesFor(['src/api/**', 'src/api/routes/*.ts'])).toEqual(['src/api'])
  })

  it('falls back to the repo root for a glob with no stable prefix', () => {
    expect(directoriesFor(['**/*.env'])).toEqual([''])
  })

  it('handles a path with no wildcard at all', () => {
    expect(directoriesFor(['src/api/router.ts'])).toEqual(['src/api'])
  })
})

describe('what a rule says', () => {
  const decision = {
    key: 'D-12',
    title: 'Ingest is idempotent by content hash',
    rationale: 'Sources replay, so replay has to be free.',
    rejectedAlternatives: [
      { title: 'Deduplicate on source ids', why: 'Two sources reuse ids across tenants.' },
    ],
    state: 'accepted',
  }

  it('carries the constraint, what it applies to, and what was rejected', () => {
    const rule = renderRule(decision, ['src/ingest/**'])
    expect(rule).toContain('Ingest is idempotent by content hash')
    expect(rule).toContain('src/ingest/**')
    expect(rule).toContain('Deduplicate on source ids')
    expect(rule).toContain('Two sources reuse ids across tenants.')
  })

  it('says when a decision is contested rather than presenting it as settled', () => {
    const rule = renderRule({ ...decision, state: 'contested' }, ['src/ingest/**'])
    expect(rule).toMatch(/contested/)
  })

  it('points back at the decision rather than inviting edits', () => {
    expect(renderRule(decision, ['src/ingest/**'])).toMatch(/Edit the decision, not this block/)
  })
})
