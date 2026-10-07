import { describe, expect, it } from 'vitest'
import { judgeScore } from './runs.js'

describe('threshold judgement', () => {
  it('has nothing to say when the clause sets no threshold', () => {
    expect(judgeScore({ check: 'eval' }, null, null).violation).toBeNull()
  })

  it('fails a threshold that produced no score', () => {
    expect(judgeScore({ check: 'eval', threshold: { minScore: 0.8 } }, null, null).violation).toMatch(
      /no score/,
    )
  })

  it('holds scores to the minimum and maximum', () => {
    const clause = { check: 'eval', threshold: { minScore: 0.8, maxScore: 0.95 } }
    expect(judgeScore(clause, 0.5, null).violation).toMatch(/below the required 0.8/)
    expect(judgeScore(clause, 0.99, null).violation).toMatch(/above the permitted 0.95/)
    expect(judgeScore(clause, 0.9, null).violation).toBeNull()
  })

  it('compares against a baseline only when there is one', () => {
    const clause = { check: 'eval', threshold: { noRegressionVs: 'baseline' as const } }
    expect(judgeScore(clause, 0.7, null)).toEqual({ violation: null, baselineRunId: null, delta: null })

    const regressed = judgeScore(clause, 0.7, { id: 'run-0', score: 0.75 })
    expect(regressed.violation).toMatch(/regressed against baseline run-0/)
    expect(regressed.delta).toBeCloseTo(-0.05)
    expect(judgeScore(clause, 0.8, { id: 'run-0', score: 0.75 }).violation).toBeNull()
  })
})
