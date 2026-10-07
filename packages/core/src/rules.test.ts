import { describe, expect, it } from 'vitest'
import { applyRuleBlock, ruleEndMarker, ruleStartMarker } from './rules.js'

const block = [ruleStartMarker('D-12'), 'Ingest is idempotent by content hash.', ruleEndMarker('D-12')].join(
  '\n',
)

describe('managed rule blocks', () => {
  it('appends to a file that has none', () => {
    const result = applyRuleBlock('# Ingest\n\nHand-written notes.\n', 'D-12', block)
    expect(result).toContain('Hand-written notes.')
    expect(result).toContain('Ingest is idempotent')
  })

  it('replaces its own block without touching anything else', () => {
    const first = applyRuleBlock('# Ingest\n\nHand-written notes.\n', 'D-12', block)
    const updated = applyRuleBlock(
      first,
      'D-12',
      [ruleStartMarker('D-12'), 'Now says something else.', ruleEndMarker('D-12')].join('\n'),
    )
    expect(updated).toContain('Hand-written notes.')
    expect(updated).toContain('Now says something else.')
    expect(updated).not.toContain('idempotent')
  })

  it('leaves other decisions blocks alone', () => {
    const other = [ruleStartMarker('D-13'), 'Something else entirely.', ruleEndMarker('D-13')].join('\n')
    const both = applyRuleBlock(applyRuleBlock('', 'D-12', block), 'D-13', other)
    const removed = applyRuleBlock(both, 'D-12', '')
    expect(removed).toContain('Something else entirely.')
    expect(removed).not.toContain('idempotent')
  })

  it('removes cleanly, leaving the human content behind', () => {
    const withBlock = applyRuleBlock('# Ingest\n\nHand-written notes.\n', 'D-12', block)
    expect(applyRuleBlock(withBlock, 'D-12', '').trim()).toBe('# Ingest\n\nHand-written notes.')
  })

  it('is a no-op when asked to remove a block that is not there', () => {
    expect(applyRuleBlock('# Ingest\n', 'D-99', '')).toBe('# Ingest\n')
  })
})
