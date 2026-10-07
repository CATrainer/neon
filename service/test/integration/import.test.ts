import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, startHarness, type Harness } from './harness.js'

/**
 * Importing a ChatGPT export, and this repo's own decision records, through
 * the same domain functions as everything else.
 */
let h: Harness
let repoId: string

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const EXPORT = `## Ideas

neon capture "Cache context packs per commit
Assembly reruns on every call even when nothing changed."

neon capture "Swap trigram matching for an ORM query builder"

## Decisions

\`\`\`neon-decision
---
title: Keep context packs uncached until assembly shows up in latency
state: accepted
decided_at: 2026-10-01
components: [service, nowhere]
evidence_runs: []
---

## Rationale

Assembly is a handful of indexed queries; a cache is a staleness bug waiting.

## Rejected alternatives

### Cache per commit

Packs depend on decisions and work orders as well as the commit, so the key is wrong.

## What would change this

Pack assembly above 100ms at p95.
\`\`\`
`

type Report = {
  ideas: { title: string; outcome: string; priorRejections: string[] }[]
  decisions: { title: string; key: string; outcome: string; state: string }[]
  problems: string[]
}

const importText = (text: string, extra: Record<string, unknown> = {}) =>
  call<Report>(h.app, 'POST', '/api/import', { text, repoId, ...extra })

beforeAll(async () => {
  h = await startHarness('import')
  const repo = await call<{ id: string }>(h.app, 'POST', '/api/repos', {
    name: 'neon',
    remoteUrl: 'https://github.com/neon-fixture/neon',
    kind: 'code',
  })
  repoId = repo.body.id
  await call(h.app, 'POST', `/api/repos/${repoId}/components`, { name: 'service', pathGlobs: ['service/**'] })
})
afterAll(async () => {
  await h.close()
})

describe('importing a ChatGPT export', () => {
  it('reports what it would do on a dry run, and creates nothing', async () => {
    const res = await importText(EXPORT, { dryRun: true })
    expect(res.status).toBe(200)
    expect(res.body.ideas.map((i) => i.outcome)).toEqual(['would create', 'would create'])
    expect(res.body.decisions[0]!.outcome).toBe('would create')
    const ideas = await call<{ ideas: unknown[] }>(h.app, 'GET', '/api/ideas')
    expect(ideas.body.ideas).toHaveLength(0)
  })

  it('captures ideas from chat and records decisions as proposed, whatever they claim', async () => {
    const res = await importText(EXPORT)
    expect(res.body.ideas.map((i) => i.outcome)).toEqual(['created', 'created'])
    expect(res.body.decisions[0]).toMatchObject({ outcome: 'created', state: 'proposed' })
    // A component the repo has not declared is reported, not invented.
    expect(res.body.problems).toEqual([expect.stringMatching(/component "nowhere" is not declared/)])

    const ideas = await call<{ ideas: { title: string; source: string; body: string }[] }>(h.app, 'GET', '/api/ideas')
    const cached = ideas.body.ideas.find((i) => i.title === 'Cache context packs per commit')!
    expect(cached.source).toBe('chat')
    expect(cached.body).toMatch(/nothing changed/)

    const decision = await call<{ rationale: string; componentIds: string[]; rejectedAlternatives: unknown[] }>(
      h.app,
      'GET',
      `/api/decisions/${res.body.decisions[0]!.key}`,
    )
    expect(decision.body.rationale).toMatch(/What would change this: Pack assembly above 100ms/)
    expect(decision.body.componentIds).toHaveLength(1)
    expect(decision.body.rejectedAlternatives).toHaveLength(1)
  })

  it('writes an event for everything it creates', async () => {
    const events = await h.handle.db.execute<{ kind: string; source: string }>(
      sql`SELECT kind, source FROM events WHERE source = 'import' ORDER BY recorded_at`,
    )
    expect(events.rows.map((e) => e.kind).sort()).toEqual(['decision.recorded', 'idea.captured', 'idea.captured'])
  })

  it('skips ideas it already has on a second import', async () => {
    const res = await importText(EXPORT)
    expect(res.body.ideas.map((i) => i.outcome)).toEqual(['exists', 'exists'])
  })
})

describe('importing this repo’s decision records', () => {
  const D004 = readFileSync(join(ROOT, 'knowledge', 'decisions', 'NEON-D-004-drizzle-over-prisma.md'), 'utf8')

  it('keeps the record’s own key, state and date when told the record is authoritative', async () => {
    const res = await importText(D004, {
      asRecorded: true,
      recordRef: 'knowledge/decisions/NEON-D-004-drizzle-over-prisma.md',
    })
    expect(res.body.decisions[0]).toMatchObject({ key: 'NEON-D-004', outcome: 'created', state: 'accepted' })

    const decision = await call<{ decidedAt: string; recordRef: string; recordContentHash: string }>(
      h.app,
      'GET',
      '/api/decisions/NEON-D-004',
    )
    expect(decision.body.decidedAt.slice(0, 10)).toBe('2026-08-08')
    expect(decision.body.recordRef).toBe('knowledge/decisions/NEON-D-004-drizzle-over-prisma.md')
    expect(decision.body.recordContentHash).toMatch(/^sha256:/)
  })

  it('skips a record whose key is already there', async () => {
    const res = await importText(D004, { asRecorded: true })
    expect(res.body.decisions[0]!.outcome).toBe('exists')
  })

  it('then answers a capture that repeats a rejected alternative with the rejection', async () => {
    const res = await importText('neon capture "Switch to Prisma"')
    expect(res.body.ideas[0]!.priorRejections.join('\n')).toMatch(/NEON-D-004: Prisma/)
  })

  it('misses the same idea phrased at length — a known limit of trigram matching', async () => {
    // Measured 2026-10-07: "Switch to Prisma" scores 0.41 against D-004's
    // rejected alternative and clears the 0.3 threshold; this phrasing scores
    // 0.18 because most of its words are not in the rejection's text. Recorded
    // here so the limit is visible, and so a better matcher shows up as this
    // test failing.
    const res = await importText('neon capture "Move the service from Drizzle to Prisma"')
    expect(res.body.ideas[0]!.priorRejections).toEqual([])
  })
})
