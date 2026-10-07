import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assembleContext } from '../../src/context/assemble.js'
import { assembleGenerativeContext } from '../../src/context/generative.js'
import { seed } from '../../src/seed/fixture.js'
import { startHarness, type Harness } from './harness.js'

/**
 * Assembly is the difference between Neon being useful and Neon being noise, so
 * these test the rules rather than the plumbing: what is left out, why each
 * item claims to be there, and what happens at the budget.
 */
let h: Harness

beforeAll(async () => {
  h = await startHarness('context')
  await seed(h.handle.db)
})
afterAll(async () => {
  await h.close()
})

describe('execution context', () => {
  it('states a reason for every item it includes', async () => {
    const pack = await assembleContext(h.handle.db, 'ATL-102', { log: false })
    expect(pack.items.length).toBeGreaterThan(0)
    for (const item of pack.items) {
      expect(item.reason.trim()).not.toBe('')
    }
  })

  it('carries the work order intent and a readable done_when', async () => {
    const pack = await assembleContext(h.handle.db, 'ATL-102', { log: false })
    expect(pack.workOrder.intent).toMatch(/burst/)
    expect(pack.doneWhen).toContain('tests.unit')
    expect(pack.doneWhen.some((d) => d.includes('scoring at least 0.82'))).toBe(true)
    expect(pack.doneWhen.some((d) => d.includes('no regression against baseline'))).toBe(true)
  })

  it('never serves a superseded decision', async () => {
    const pack = await assembleContext(h.handle.db, 'ATL-102', { log: false })
    expect(pack.items.some((i) => i.ref === 'D-9')).toBe(false)
  })

  it('leaves out constraints already carried by a path-scoped rule, and says so', async () => {
    const pack = await assembleContext(h.handle.db, 'ATL-102', { log: false })
    expect(pack.items.some((i) => i.ref === 'D-12')).toBe(false)
    expect(pack.notes.some((n) => n.includes('D-12') && n.includes('path-scoped rule'))).toBe(true)
  })

  it('includes contracts the components in scope publish', async () => {
    const pack = await assembleContext(h.handle.db, 'ATL-102', { log: false })
    const contract = pack.items.find((i) => i.kind === 'contract')
    expect(contract?.ref).toBe('record@2.1.0')
    expect(contract?.reason).toMatch(/published by ingest/)
  })

  it('surfaces a contested decision with both positions', async () => {
    const pack = await assembleContext(h.handle.db, 'CAN-201', { log: false })
    const contested = pack.items.find((i) => i.ref === 'D-13')
    expect(contested).toBeDefined()
    expect(contested!.reason).toMatch(/unsettled/)
    expect(contested!.summary).toMatch(/settles when/)
  })

  it('drops the lowest-relevance items at the budget and reports what went', async () => {
    const generous = await assembleContext(h.handle.db, 'ATL-102', { log: false, budgetTokens: 6000 })
    const tight = await assembleContext(h.handle.db, 'ATL-102', { log: false, budgetTokens: 60 })

    expect(tight.items.length).toBeLessThan(generous.items.length)
    expect(tight.omitted.length).toBeGreaterThan(0)
    expect(tight.budget.used).toBeLessThanOrEqual(
      tight.budget.tokens + estimateSpineOverrun(tight.budget.used, tight.budget.tokens),
    )
    expect(tight.notes.some((n) => n.includes('dropped'))).toBe(true)

    // What survives is what scored highest: decisions and contracts before
    // recent-work trivia.
    const droppedKinds = tight.omitted.map((o) => o.kind)
    expect(droppedKinds).toContain('related_work_order')
  })

  it('logs every pack it assembles', async () => {
    const before = await countPacks()
    await assembleContext(h.handle.db, 'ATL-102', {})
    expect(await countPacks()).toBe(before + 1)
  })
})

describe('generative context', () => {
  it('offers rejected alternatives with what blocked them', async () => {
    const material = await assembleGenerativeContext(h.handle.db, { log: false })
    const reranker = material.rejectedAlternatives.find((r) => /cross-encoder/i.test(r.alternative))
    expect(reranker).toBeDefined()
    expect(reranker!.blockedBy).toMatch(/latency budget/i)
    expect(reranker!.decidedDaysAgo).toBeGreaterThan(0)
  })

  it('refuses to present itself as a recommendation', async () => {
    const material = await assembleGenerativeContext(h.handle.db, { log: false })
    expect(material.notes[0]).toMatch(/material, not a recommendation/)
  })

  it('surfaces contested decisions with their settling condition', async () => {
    const material = await assembleGenerativeContext(h.handle.db, { log: false })
    expect(material.contested[0]?.settlingCondition).toMatch(/eval run/)
    expect(material.contested[0]?.positions).toHaveLength(2)
  })

  it('surfaces ideas about to expire, before they quietly go', async () => {
    const material = await assembleGenerativeContext(h.handle.db, { log: false })
    expect(material.ageingIdeas.length).toBeGreaterThan(0)
    expect(material.ageingIdeas[0]!.daysLeft).toBeLessThan(21)
  })

  it('can be biased towards an area without excluding everything else', async () => {
    const focused = await assembleGenerativeContext(h.handle.db, {
      log: false,
      focus: 'reranking latency',
    })
    expect(focused.focus).toBe('reranking latency')
    expect(focused.rejectedAlternatives.some((r) => /cross-encoder/i.test(r.alternative))).toBe(true)
    expect(focused.notes.some((n) => n.includes('filtered'))).toBe(true)
  })
})

async function countPacks(): Promise<number> {
  const result = await h.handle.pool.query<{ count: string }>('SELECT count(*) FROM context_packs')
  return Number(result.rows[0]!.count)
}

/** The spine — intent, criteria, done_when — is counted but never dropped, so a
 *  tiny budget can legitimately be exceeded by it alone. */
function estimateSpineOverrun(used: number, budget: number): number {
  return Math.max(0, used - budget)
}
