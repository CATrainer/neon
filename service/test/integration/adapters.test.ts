import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, startHarness, type Harness } from './harness.js'

/**
 * The check adapters against a real working tree.
 *
 * The schema adapter is the one that matters here: it is what makes inquiry
 * work checkable, and it has to be able to genuinely fail a record — a review
 * that cannot say no is a rubber stamp with extra steps.
 */
let h: Harness
let workdir: string

beforeAll(async () => {
  h = await startHarness('adapters')
  workdir = mkdtempSync(join(tmpdir(), 'neon-adapters-'))
})

afterAll(async () => {
  await h.close()
  rmSync(workdir, { recursive: true, force: true })
})

interface Report {
  passed: boolean
  results: {
    check: string
    result: string
    failureSummary: string | null
    runId: string | null
  }[]
}

async function setup(kind: 'code' | 'inquiry', doneWhen: unknown[], checks: unknown[]) {
  const suffix = Math.random().toString(36).slice(2, 8)
  const repo = await call<{ id: string }>(h.app, 'POST', '/api/repos', {
    name: `fixture-${suffix}`,
    remoteUrl: `https://github.com/neon-fixture/${suffix}`,
    kind: kind === 'inquiry' ? 'knowledge' : 'code',
    localPath: workdir,
  })
  await call(h.app, 'POST', `/api/repos/${repo.body.id}/checks`, { checks })

  const workOrder = await call<{ key: string }>(h.app, 'POST', '/api/work-orders', {
    kind,
    title: `Adapter fixture ${suffix}`,
    intent: 'Exercise an adapter against a real working tree.',
    acceptanceCriteria: ['the adapter returns a verdict'],
    doneWhen,
    state: 'ready',
    repoId: repo.body.id,
  })

  const started = await call<{ change: { id: string }; specPath: string }>(
    h.app,
    'POST',
    '/api/changes/start',
    { workOrderKey: workOrder.body.key, repoId: repo.body.id },
  )
  return { repoId: repo.body.id, changeId: started.body.change.id, specPath: started.body.specPath }
}

describe('the command adapter', () => {
  it('passes on exit 0 and keeps the output as an artifact', async () => {
    const { changeId } = await setup(
      'code',
      [{ check: 'says.hello' }],
      [{ name: 'says.hello', kind: 'command', runnerRef: 'node -e "console.log(\'hello\')"' }],
    )
    const report = await call<Report>(h.app, 'POST', `/api/changes/${changeId}/check`, { workdir })
    expect(report.body.passed).toBe(true)

    const runs = await call<{ runs: { artifacts: { name: string; preview: string }[] }[] }>(
      h.app,
      'GET',
      `/api/runs?changeId=${changeId}`,
    )
    const stdout = runs.body.runs[0]!.artifacts.find((a) => a.name === 'stdout')
    expect(stdout?.preview).toContain('hello')
  })

  it('fails on a non-zero exit, and says what the command said', async () => {
    const { changeId } = await setup(
      'code',
      [{ check: 'always.fails' }],
      [
        {
          name: 'always.fails',
          kind: 'command',
          runnerRef: 'node -e "console.error(\'3 tests failed\'); process.exit(1)"',
        },
      ],
    )
    const report = await call<Report>(h.app, 'POST', `/api/changes/${changeId}/check`, { workdir })
    expect(report.body.passed).toBe(false)
    expect(report.body.results[0]!.result).toBe('fail')
    expect(report.body.results[0]!.failureSummary).toContain('3 tests failed')
  })

  it('substitutes the work order\'s params into the declared command', async () => {
    const { changeId } = await setup(
      'code',
      [{ check: 'echoes.suite', params: { suite: 'identifiers' } }],
      [{ name: 'echoes.suite', kind: 'command', runnerRef: 'node -e "console.log(\'suite=$suite\')"' }],
    )
    await call(h.app, 'POST', `/api/changes/${changeId}/check`, { workdir })
    const runs = await call<{ runs: { artifacts: { name: string; preview: string }[] }[] }>(
      h.app,
      'GET',
      `/api/runs?changeId=${changeId}`,
    )
    expect(runs.body.runs[0]!.artifacts[0]!.preview).toContain('suite=identifiers')
  })
})

describe('the schema adapter', () => {
  const checks = [
    {
      name: 'record.schema',
      kind: 'schema',
      defaultParams: { kind: 'decision' },
    },
  ]
  const doneWhen = [
    {
      check: 'record.schema',
      params: { kind: 'decision', requires: 'rationale,rejected_alternatives,components' },
    },
  ]

  it('fails when the work produced no record at all', async () => {
    const { changeId } = await setup('inquiry', doneWhen, checks)
    const report = await call<Report>(h.app, 'POST', `/api/changes/${changeId}/check`, { workdir })
    expect(report.body.passed).toBe(false)
    expect(report.body.results[0]!.failureSummary).toMatch(/no decision record at/)
  })

  it('fails a record that states a conclusion but no rejected alternative', async () => {
    const { changeId, specPath } = await setup('inquiry', doneWhen, checks)
    write(
      specPath,
      `---
title: Ranking is judged by nDCG@10
components: [retrieval]
---

## Rationale

One number, comparable over time.
`,
    )

    const report = await call<Report>(h.app, 'POST', `/api/changes/${changeId}/check`, { workdir })
    expect(report.body.passed).toBe(false)
    expect(report.body.results[0]!.failureSummary).toMatch(/rejected_alternatives/)
  })

  it('passes once the record names what was rejected and what it constrains', async () => {
    const { changeId, specPath } = await setup('inquiry', doneWhen, checks)
    write(
      specPath,
      `---
title: Ranking is judged by nDCG@10
components: [retrieval]
---

## Rationale

One number, comparable over time, and cheap enough to run on every change.

## Rejected alternatives

### Recall of must-hit records per query class

Closer to what users report, but the classes are ours to define and we would be
grading our own homework until the golden set is external.
`,
    )

    const report = await call<Report>(h.app, 'POST', `/api/changes/${changeId}/check`, { workdir })
    expect(report.body.passed).toBe(true)
    expect(report.body.results[0]!.runId).toBeTruthy()
  })

  it('is not citable as evidence without version pins, even when it passes', async () => {
    const { changeId, specPath } = await setup('inquiry', doneWhen, checks)
    write(specPath, `---\ncomponents: [retrieval]\n---\n\n## Rationale\n\nBecause.\n\n## Rejected alternatives\n\n### The other one\n\nToo slow.\n`)
    await call(h.app, 'POST', `/api/changes/${changeId}/check`, { workdir })

    const runs = await call<{ runs: { citable: boolean }[] }>(
      h.app,
      'GET',
      `/api/runs?changeId=${changeId}`,
    )
    expect(runs.body.runs[0]!.citable).toBe(false)
  })
})

function write(relativePath: string, content: string) {
  const path = join(workdir, relativePath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content, 'utf8')
}
