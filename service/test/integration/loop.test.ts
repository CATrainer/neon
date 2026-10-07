import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, startHarness, type Harness } from './harness.js'

/**
 * The loop, end to end, twice: once for code work and once for inquiry work.
 *
 * This is the test that matters. If it passes, a developer can capture an idea,
 * promote it, claim it, be checked and finish — with the whole thing recorded —
 * and the inquiry path goes through the same machinery rather than a parallel
 * one built for it.
 */
let h: Harness

beforeAll(async () => {
  h = await startHarness('loop')
})
afterAll(async () => {
  await h.close()
})

describe('the loop, for code work', () => {
  let repoId: string
  let ideaId: string
  let workOrderId: string
  let workOrderKey: string
  let changeId: string

  it('registers a code repo from its remote', async () => {
    const res = await call<{ id: string; keyPrefix: string }>(h.app, 'POST', '/api/repos', {
      name: 'atlas',
      remoteUrl: 'git@github.com:neon-fixture/atlas.git',
      kind: 'code',
      keyPrefix: 'ATL',
    })
    expect(res.status).toBe(201)
    repoId = res.body.id

    // The same repo by a different remote shape resolves to the same record.
    const resolved = await call<{ id: string }>(
      h.app,
      'GET',
      '/api/repos/resolve?remote=https://github.com/neon-fixture/atlas',
    )
    expect(resolved.body.id).toBe(repoId)
  })

  it('takes the repo-declared checks', async () => {
    const res = await call<{ checks: unknown[] }>(h.app, 'POST', `/api/repos/${repoId}/checks`, {
      yaml: ['checks:', '  - name: noop', '    kind: noop', '    description: proves the loop'].join(
        '\n',
      ),
    })
    expect(res.status).toBe(200)
    expect(res.body.checks).toHaveLength(1)
  })

  it('captures an idea with nothing but a title and a body', async () => {
    const res = await call<{ idea: { id: string } }>(h.app, 'POST', '/api/ideas', {
      title: 'Bound the ingest queue',
      body: 'A burst from one source takes the whole ingest path down.',
      source: 'session',
    })
    expect(res.status).toBe(201)
    ideaId = res.body.idea.id
  })

  it('refuses to promote straight to ready without a done_when', async () => {
    const res = await call<{ error: string; message: string }>(
      h.app,
      'POST',
      `/api/ideas/${ideaId}/promote`,
      {
        kind: 'code',
        intent: 'Ingest falls over under burst load, which reads to everyone else as data loss.',
        acceptanceCriteria: ['the queue is bounded'],
        repoId,
        state: 'ready',
      },
    )
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/empty done_when/)
  })

  it('promotes the idea to a draft work order', async () => {
    const res = await call<{ id: string; key: string; state: string }>(
      h.app,
      'POST',
      `/api/ideas/${ideaId}/promote`,
      {
        kind: 'code',
        intent: 'Ingest falls over under burst load, which reads to everyone else as data loss.',
        acceptanceCriteria: ['the queue is bounded', 'a burst is covered by a test'],
        repoId,
      },
    )
    expect(res.status).toBe(201)
    expect(res.body.state).toBe('draft')
    expect(res.body.key).toMatch(/^ATL-\d+$/)
    workOrderId = res.body.id
    workOrderKey = res.body.key

    const idea = await call<{ state: string; promotedToWorkOrderId: string }>(
      h.app,
      'GET',
      `/api/ideas/${ideaId}`,
    )
    expect(idea.body.state).toBe('promoted')
    expect(idea.body.promotedToWorkOrderId).toBe(workOrderId)
  })

  it('will not claim work that is still a draft', async () => {
    const res = await call<{ message: string }>(h.app, 'POST', '/api/changes/start', {
      workOrderKey,
      repoId,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/still a draft/)
  })

  it('becomes ready once it has an executable done_when', async () => {
    const res = await call<{ state: string }>(h.app, 'PATCH', `/api/work-orders/${workOrderId}`, {
      doneWhen: [{ check: 'noop' }],
      state: 'ready',
    })
    expect(res.status).toBe(200)
    expect(res.body.state).toBe('ready')
  })

  it('claims the work and scaffolds a change', async () => {
    const res = await call<{
      change: { id: string; state: string }
      branch: string
      specPath: string
      resumed: boolean
    }>(h.app, 'POST', '/api/changes/start', { workOrderKey, repoId })

    expect(res.status).toBe(201)
    expect(res.body.branch).toContain(workOrderKey.toLowerCase())
    expect(res.body.specPath).toMatch(/^openspec\/changes\/.*\/proposal\.md$/)
    expect(res.body.resumed).toBe(false)
    changeId = res.body.change.id

    const workOrder = await call<{ state: string }>(h.app, 'GET', `/api/work-orders/${workOrderKey}`)
    expect(workOrder.body.state).toBe('in_progress')
  })

  it('resumes rather than double-claiming', async () => {
    const res = await call<{ resumed: boolean; change: { id: string } }>(
      h.app,
      'POST',
      '/api/changes/start',
      { workOrderKey, repoId },
    )
    expect(res.status).toBe(200)
    expect(res.body.resumed).toBe(true)
    expect(res.body.change.id).toBe(changeId)
  })

  it('runs done_when and records a run', async () => {
    const res = await call<{
      passed: boolean
      results: { check: string; result: string; runId: string; citable: boolean }[]
    }>(h.app, 'POST', `/api/changes/${changeId}/check`, {})

    expect(res.body.passed).toBe(true)
    expect(res.body.results[0]!.check).toBe('noop')

    const runs = await call<{ runs: unknown[] }>(h.app, 'GET', `/api/runs?changeId=${changeId}`)
    expect(runs.body.runs).toHaveLength(1)
  })

  it('does not treat an unpinned run as evidence', async () => {
    const runs = await call<{ runs: { id: string; citable: boolean }[] }>(
      h.app,
      'GET',
      `/api/runs?changeId=${changeId}`,
    )
    const run = runs.body.runs[0]!
    expect(run.citable).toBe(false)

    const decision = await call<{ id: string }>(h.app, 'POST', '/api/decisions', {
      title: 'Ingest is bounded rather than elastic',
      rationale: 'Dropping work loudly beats dying silently.',
      rejectedAlternatives: [
        { title: 'Autoscale on queue depth', why: 'Cost is unbounded and the burst is minutes long.' },
      ],
      state: 'accepted',
    })

    const attach = await call<{ message: string }>(
      h.app,
      'POST',
      `/api/decisions/${decision.body.id}/evidence`,
      { runId: run.id },
    )
    expect(attach.status).toBe(400)
    expect(attach.body.message).toMatch(/not citable/)
  })

  it('finishes, and the work order moves to review', async () => {
    const res = await call(h.app, 'POST', `/api/changes/${changeId}/finish`, {
      summary: 'Bounded the queue and covered the burst case.',
    })
    expect(res.status).toBe(200)

    const workOrder = await call<{ state: string }>(h.app, 'GET', `/api/work-orders/${workOrderKey}`)
    expect(workOrder.body.state).toBe('review')
  })
})

describe('a definition of done that cannot be executed', () => {
  it('fails the check rather than erroring out of the report', async () => {
    // The Stop hook treats an API error as "cannot tell" and stands aside, so a
    // clause naming a check that does not exist has to come back as a failed
    // result — otherwise a typo in a done_when silently waves work through.
    const repos = await call<{ repos: { id: string; kind: string }[] }>(h.app, 'GET', '/api/repos')
    const repoId = repos.body.repos.find((r) => r.kind === 'code')!.id

    const workOrder = await call<{ id: string; key: string }>(h.app, 'POST', '/api/work-orders', {
      kind: 'code',
      title: 'Work order with a check nobody declared',
      intent: 'Prove that an unexecutable definition of done blocks rather than passes.',
      acceptanceCriteria: ['the check report says the check is missing'],
      doneWhen: [{ check: 'noop' }, { check: 'does.not.exist' }],
      state: 'ready',
      repoId,
    })

    const started = await call<{ change: { id: string } }>(h.app, 'POST', '/api/changes/start', {
      workOrderKey: workOrder.body.key,
      repoId,
    })

    const report = await call<{
      passed: boolean
      results: { check: string; result: string; runId: string | null; failureSummary: string }[]
    }>(h.app, 'POST', `/api/changes/${started.body.change.id}/check`, {})

    expect(report.body.passed).toBe(false)
    const missing = report.body.results.find((r) => r.check === 'does.not.exist')!
    expect(missing.result).toBe('error')
    expect(missing.runId).toBeNull()
    expect(missing.failureSummary).toMatch(/neon\.checks\.yaml/)
    // The clause that could run still ran.
    expect(report.body.results.find((r) => r.check === 'noop')!.result).toBe('pass')
  })
})

describe('the loop, for inquiry work', () => {
  let repoId: string
  let workOrderKey: string
  let changeId: string

  it('registers a knowledge repo and its checks', async () => {
    const repo = await call<{ id: string }>(h.app, 'POST', '/api/repos', {
      name: 'canon',
      remoteUrl: 'https://github.com/neon-fixture/canon',
      kind: 'knowledge',
      keyPrefix: 'CAN',
    })
    repoId = repo.body.id
    await call(h.app, 'POST', `/api/repos/${repoId}/checks`, {
      checks: [{ name: 'noop', kind: 'noop' }],
    })
  })

  it('creates inquiry work with the same gates as code work', async () => {
    const draft = await call<{ key: string; id: string }>(h.app, 'POST', '/api/work-orders', {
      kind: 'inquiry',
      title: 'Decide how ranking quality is judged',
      intent: 'The argument recurs monthly because neither position is falsifiable as stated.',
      acceptanceCriteria: [
        'a record naming the measure and its limits',
        'one alternative measure rejected with reasoning',
      ],
      repoId,
    })
    workOrderKey = draft.body.key

    const premature = await call<{ message: string }>(
      h.app,
      'PATCH',
      `/api/work-orders/${draft.body.id}`,
      { state: 'ready' },
    )
    expect(premature.status).toBe(400)

    const ready = await call<{ state: string }>(h.app, 'PATCH', `/api/work-orders/${draft.body.id}`, {
      doneWhen: [{ check: 'noop' }],
      state: 'ready',
    })
    expect(ready.body.state).toBe('ready')
  })

  it('claims into a record rather than a code branch', async () => {
    const res = await call<{ change: { id: string }; specPath: string; branch: string }>(
      h.app,
      'POST',
      '/api/changes/start',
      { workOrderKey, repoId },
    )
    expect(res.status).toBe(201)
    expect(res.body.specPath).toMatch(/^records\/.*\.md$/)
    expect(res.body.branch).toContain('inquiry')
    changeId = res.body.change.id
  })

  it('checks and finishes through the same endpoints', async () => {
    const checked = await call<{ passed: boolean }>(
      h.app,
      'POST',
      `/api/changes/${changeId}/check`,
      {},
    )
    expect(checked.body.passed).toBe(true)

    const finished = await call(h.app, 'POST', `/api/changes/${changeId}/finish`, {
      summary: 'Recorded the measure and what would change it.',
    })
    expect(finished.status).toBe(200)
  })

  it('refuses to point inquiry work at a code repo', async () => {
    const codeRepo = await call<{ id: string }>(h.app, 'GET', '/api/repos')
    const repos = (codeRepo.body as unknown as { repos: { id: string; kind: string }[] }).repos
    const code = repos.find((r) => r.kind === 'code')!

    const draft = await call<{ id: string; key: string }>(h.app, 'POST', '/api/work-orders', {
      kind: 'inquiry',
      title: 'Whether to keep the ontology in one file',
      intent: 'It is getting long and nobody agrees on how to split it.',
      acceptanceCriteria: ['a record with a recommendation'],
      doneWhen: [{ check: 'noop' }],
      state: 'ready',
      repoId,
    })

    const res = await call<{ message: string }>(h.app, 'POST', '/api/changes/start', {
      workOrderKey: draft.body.key,
      repoId: code.id,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/records, not commits/)
  })
})
