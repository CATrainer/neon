import { describe, expect, it } from 'vitest'
import { canEnter, gateViolations, type LadderSubject } from './ladder.js'

const draftable: LadderSubject = {
  intent: 'Retrieval quality is unmeasured, so we cannot tell a regression from noise.',
  acceptanceCriteria: ['a scored harness exists', 'a baseline is recorded'],
  doneWhen: [],
}

describe('maturity ladder gates', () => {
  it('lets a work order with intent and criteria be a draft', () => {
    expect(canEnter('draft', draftable)).toBe(true)
  })

  it('refuses a draft with no intent', () => {
    expect(gateViolations('draft', { ...draftable, intent: '   ' })).toContain(
      'a work order needs an intent: why we are doing this',
    )
  })

  it('refuses a draft whose acceptance criteria are all blank', () => {
    expect(gateViolations('draft', { ...draftable, acceptanceCriteria: ['', ' '] })).toHaveLength(1)
  })

  it('refuses to leave draft with an empty done_when', () => {
    expect(canEnter('ready', draftable)).toBe(false)
    expect(gateViolations('ready', draftable)[0]).toMatch(/empty done_when/)
  })

  it('allows ready once done_when has a clause', () => {
    expect(canEnter('ready', { ...draftable, doneWhen: [{ check: 'tests.unit' }] })).toBe(true)
  })

  it('holds the done_when gate for inquiry work too — same machinery', () => {
    const inquiry: LadderSubject = {
      intent: 'Decide whether retrieval should be hybrid or dense-only.',
      acceptanceCriteria: ['a decision record naming a rejected alternative'],
      doneWhen: [],
    }
    expect(canEnter('ready', inquiry)).toBe(false)
  })

  it('reports every violation at once', () => {
    expect(gateViolations('ready', { intent: '', acceptanceCriteria: [], doneWhen: [] })).toHaveLength(3)
  })

  it('does not gate abandonment', () => {
    expect(canEnter('abandoned', { intent: '', acceptanceCriteria: [], doneWhen: [] })).toBe(true)
  })
})
