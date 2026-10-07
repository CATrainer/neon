import { describe, expect, it } from 'vitest'
import { substitute } from './command.js'

describe('command parameter substitution', () => {
  it('fills declared parameters', () => {
    expect(substitute('npm run eval -- --suite $suite', { suite: 'core-flows' })).toBe(
      'npm run eval -- --suite core-flows',
    )
  })

  it('accepts braced form', () => {
    expect(substitute('run ${suite}-cases', { suite: 'identifiers' })).toBe('run identifiers-cases')
  })

  it('leaves unknown placeholders alone rather than emptying them', () => {
    // Silently substituting an empty string turns `--suite $suite` into
    // `--suite`, which runs a different thing and passes.
    expect(substitute('npm test -- --suite $suite', {})).toBe('npm test -- --suite $suite')
  })

  it('substitutes numbers and booleans', () => {
    expect(substitute('run --n $count --strict $strict', { count: 3, strict: true })).toBe(
      'run --n 3 --strict true',
    )
  })
})
