import { describe, expect, it } from 'vitest'
import { hashContent, hashParams, newId } from './ids.js'

describe('ids and hashes', () => {
  it('mints sortable, unique ids', () => {
    const a = newId()
    const b = newId()
    expect(a).not.toBe(b)
    expect(a).toHaveLength(26)
  })

  it('hashes params independent of key order', () => {
    expect(hashParams({ suite: 'core-flows', fixture: 'baseline-v2' })).toBe(
      hashParams({ fixture: 'baseline-v2', suite: 'core-flows' }),
    )
  })

  it('distinguishes different param values', () => {
    expect(hashParams({ suite: 'core-flows' })).not.toBe(hashParams({ suite: 'edge-cases' }))
  })

  it('does not collide on ambiguous concatenation', () => {
    expect(hashParams({ a: 'x', b: 'y' })).not.toBe(hashParams({ 'a=x': '', b: 'y' }))
  })

  it('hashes content stably', () => {
    expect(hashContent('one')).toBe(hashContent('one'))
    expect(hashContent('one')).not.toBe(hashContent('two'))
  })
})
