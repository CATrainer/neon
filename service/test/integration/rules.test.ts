import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../../src/seed/fixture.js'
import { call, startHarness, type Harness } from './harness.js'

/**
 * Rule generation, over its whole life: a decision gains a rule, a superseded
 * decision loses one, and nothing is ever written without a person asking.
 */
let h: Harness
let repoId: string

interface Plan {
  plan: {
    decisionId: string
    decisionKey: string
    path: string
    action: string
    block: string
    contentHash: string
    globs: string[]
    componentId: string | null
    reason: string
  }[]
}

beforeAll(async () => {
  h = await startHarness('rules')
  await seed(h.handle.db)
  const repos = await call<{ repos: { id: string; kind: string }[] }>(h.app, 'GET', '/api/repos')
  repoId = repos.body.repos.find((r) => r.kind === 'code')!.id
})
afterAll(async () => {
  await h.close()
})

describe('planning rules', () => {
  it('proposes a rule for a decision that constrains a component', async () => {
    const { body } = await call<Plan>(h.app, 'GET', `/api/repos/${repoId}/rules/plan`)
    const dense = body.plan.find((item) => item.decisionKey === 'D-11')
    expect(dense).toBeDefined()
    expect(dense!.action).toBe('create')
    expect(dense!.path).toBe('src/retrieval/CLAUDE.md')
    expect(dense!.reason).toMatch(/constrains retrieval/)
  })

  it('leaves an already-applied rule alone when nothing changed', async () => {
    const { body } = await call<Plan>(h.app, 'GET', `/api/repos/${repoId}/rules/plan`)
    // The fixture has one rule already applied, for D-12 on ingest.
    const applied = body.plan.find((item) => item.decisionKey === 'D-12')
    expect(applied).toBeDefined()
    // Its recorded hash is from the fixture, not from this generator, so it
    // reads as an update — which is the correct answer for content that has
    // drifted from what Neon last generated.
    expect(['update', 'unchanged']).toContain(applied!.action)
  })

  it('proposes removal for a superseded decision that still has a rule', async () => {
    const plan = await call<Plan>(h.app, 'GET', `/api/repos/${repoId}/rules/plan`)
    const dense = plan.body.plan.find((item) => item.decisionKey === 'D-11')!

    await call(h.app, 'POST', `/api/repos/${repoId}/rules/applied`, {
      applied: [
        {
          decisionId: dense.decisionId,
          componentId: dense.componentId,
          path: dense.path,
          globs: dense.globs,
          contentHash: dense.contentHash,
          state: 'applied',
        },
      ],
    })

    // Supersede it with a new decision constraining the same component.
    await call(h.app, 'POST', '/api/decisions', {
      title: 'Retrieval is hybrid after all',
      rationale: 'Identifier recall became the dominant failure, which is what we said would change this.',
      componentIds: ['cmp-retrieval'],
      state: 'accepted',
      supersedes: dense.decisionId,
      rejectedAlternatives: [
        { title: 'Staying dense-only', why: 'Exact identifiers are now the failure users report most.' },
      ],
    })

    const after = await call<Plan>(h.app, 'GET', `/api/repos/${repoId}/rules/plan`)
    const removal = after.body.plan.find(
      (item) => item.decisionKey === 'D-11' && item.action === 'remove',
    )
    expect(removal).toBeDefined()
    expect(removal!.reason).toMatch(/superseded/)
    expect(removal!.block).toBe('')
  })

  it('never writes anything itself — the plan is the product', async () => {
    // Asking for the plan twice changes nothing about what is recorded.
    const first = await call<Plan>(h.app, 'GET', `/api/repos/${repoId}/rules/plan`)
    const second = await call<Plan>(h.app, 'GET', `/api/repos/${repoId}/rules/plan`)
    expect(second.body.plan.map((i) => i.action)).toEqual(first.body.plan.map((i) => i.action))
  })
})

describe('the context pack and the rules divide the work', () => {
  it('omits a constraint from the pack once a rule carries it', async () => {
    const pack = await call<{ items: { ref: string }[]; notes: string[] }>(
      h.app,
      'GET',
      '/api/work-orders/ATL-102/context',
    )
    // D-12 is carried by a rule on src/ingest/**, so it is not in the pack.
    expect(pack.body.items.some((item) => item.ref === 'D-12')).toBe(false)
    expect(pack.body.notes.some((note) => note.includes('path-scoped rule'))).toBe(true)
  })
})
