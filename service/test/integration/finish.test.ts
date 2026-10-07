import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, startHarness, type Harness } from './harness.js'

/**
 * Finishing follows from the checks. The verdict is the latest run of each
 * done_when clause on the change — nothing is re-run at finish time — and a
 * failing verdict refuses unless a person overrides it with a reason.
 */
let h: Harness
let repoId: string

beforeAll(async () => {
  h = await startHarness('finish')
  const repo = await call<{ id: string }>(h.app, 'POST', '/api/repos', {
    name: 'ledger',
    remoteUrl: 'https://github.com/neon-fixture/ledger',
    kind: 'code',
    keyPrefix: 'LED',
  })
  repoId = repo.body.id
  await call(h.app, 'POST', `/api/repos/${repoId}/checks`, {
    checks: [
      { name: 'gate', kind: 'noop' },
      { name: 'quality', kind: 'noop' },
    ],
  })
})
afterAll(async () => {
  await h.close()
})

let counter = 0
async function newChange(doneWhen: unknown[] = [{ check: 'gate' }]) {
  counter += 1
  const workOrder = await call<{ key: string; id: string }>(h.app, 'POST', '/api/work-orders', {
    kind: 'code',
    title: `Finish scenario ${counter}`,
    intent: 'Exercise what finishing is judged on.',
    acceptanceCriteria: ['finishing follows the checks'],
    doneWhen,
    state: 'ready',
    repoId,
  })
  const started = await call<{ change: { id: string } }>(h.app, 'POST', '/api/changes/start', {
    workOrderKey: workOrder.body.key,
    repoId,
  })
  return { changeId: started.body.change.id, key: workOrder.body.key, workOrderId: workOrder.body.id }
}

const record = (changeId: string, result: 'pass' | 'fail', extra: Record<string, unknown> = {}) =>
  call<{ id: string }>(h.app, 'POST', '/api/runs', {
    checkName: 'gate',
    repoId,
    changeId,
    result,
    trigger: 'local',
    ...extra,
  })

const finish = (changeId: string, body: Record<string, unknown> = {}) =>
  call<{ message: string; overridden: boolean; verdict: { passed: boolean; results: { runId: string }[] } }>(
    h.app,
    'POST',
    `/api/changes/${changeId}/finish`,
    { summary: 'done', ...body },
  )

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('finishing a change', () => {
  it('refuses when the checks have never run', async () => {
    const { changeId, workOrderId } = await newChange()
    const res = await finish(changeId)
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/never run on this change/)

    const workOrder = await call<{ state: string }>(h.app, 'GET', `/api/work-orders/${workOrderId}`)
    expect(workOrder.body.state).toBe('in_progress')
  })

  it('refuses while the latest run fails, and names the failure', async () => {
    const { changeId } = await newChange()
    await record(changeId, 'fail', { failureSummary: '3 tests failed' })
    const res = await finish(changeId)
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/gate: 3 tests failed/)
    expect(res.body.message).toMatch(/neon finish --override/)
  })

  it('judges the latest run, so a fix after a failure lets it finish', async () => {
    const { changeId } = await newChange()
    await record(changeId, 'fail')
    await tick()
    const checked = await call<{ passed: boolean }>(h.app, 'POST', `/api/changes/${changeId}/check`, {})
    expect(checked.body.passed).toBe(true)

    const res = await finish(changeId)
    expect(res.status).toBe(200)
    expect(res.body.overridden).toBe(false)
  })

  it('needs every clause to pass, not just one', async () => {
    const { changeId } = await newChange([{ check: 'gate' }, { check: 'quality' }])
    await record(changeId, 'pass')
    const res = await finish(changeId)
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/quality has never run/)
  })

  it('holds a passing run to the work order threshold', async () => {
    const { changeId } = await newChange([{ check: 'gate', threshold: { minScore: 0.8 } }])
    await record(changeId, 'pass', { score: 0.5 })
    const res = await finish(changeId)
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/scored 0.5, below the required 0.8/)
  })

  it('treats runs from another commit as stale when told the commit', async () => {
    const { changeId } = await newChange()
    await call(h.app, 'POST', `/api/changes/${changeId}/check`, { pins: { configCommit: 'aaaaaaa111' } })

    const stale = await finish(changeId, { atCommit: 'bbbbbbb222' })
    expect(stale.status).toBe(409)
    expect(stale.body.message).toMatch(/last ran at aaaaaaa, not at bbbbbbb/)

    const fresh = await finish(changeId, { atCommit: 'aaaaaaa111' })
    expect(fresh.status).toBe(200)
  })

  it('runs nothing itself', async () => {
    const { changeId } = await newChange()
    await call(h.app, 'POST', `/api/changes/${changeId}/check`, {})
    const before = await call<{ runs: { id: string }[] }>(h.app, 'GET', `/api/runs?changeId=${changeId}`)

    const res = await finish(changeId)
    expect(res.status).toBe(200)
    const after = await call<{ runs: unknown[] }>(h.app, 'GET', `/api/runs?changeId=${changeId}`)
    expect(after.body.runs).toHaveLength(before.body.runs.length)
    // And it cites the run that was already there.
    expect(res.body.verdict.results[0]!.runId).toBe(before.body.runs[0]!.id)
  })

  it('lets a person override with a reason, and records it', async () => {
    const { changeId } = await newChange()
    await record(changeId, 'fail', { failureSummary: 'upstream sandbox down' })

    const res = await finish(changeId, { override: { reason: 'sandbox outage; verified by hand' } })
    expect(res.status).toBe(200)
    expect(res.body.overridden).toBe(true)

    const events = await h.handle.db.execute<{ payload: { override: { reason: string } | null } }>(
      sql`SELECT payload FROM events WHERE kind = 'change.finished' AND subject_id = ${changeId}`,
    )
    expect(events.rows[0]!.payload.override).toEqual({ reason: 'sandbox outage; verified by hand' })
  })

  it('does not accept an empty override reason', async () => {
    const { changeId } = await newChange()
    await record(changeId, 'fail')
    const res = await finish(changeId, { override: { reason: '' } })
    expect(res.status).toBe(400)
  })
})
