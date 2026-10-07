import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../../src/seed/fixture.js'
import { call, startHarness, type Harness } from './harness.js'

/**
 * The MCP surface as an agent actually meets it: over the wire, through the
 * SDK client, against a seeded corpus.
 */
let h: Harness
let client: Client

const REMOTE = 'https://github.com/neon-fixture/atlas'

beforeAll(async () => {
  h = await startHarness('mcp')
  await seed(h.handle.db)
  await h.app.listen({ port: 0, host: '127.0.0.1' })

  const { port } = h.app.server.address() as AddressInfo
  client = new Client({ name: 'test-agent', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))
})

afterAll(async () => {
  await client.close()
  await h.close()
})

/** Tool results come back as text; every tool here answers in JSON. */
async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[]
    isError?: boolean
  }
  const text = result.content.map((c) => c.text).join('\n')
  if (result.isError) throw new Error(text)
  return JSON.parse(text) as T
}

describe('the MCP surface', () => {
  it('is small and fixed', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'neon_check',
      'neon_finish_work',
      'neon_generative_context',
      'neon_get_context',
      'neon_propose',
      'neon_search',
      'neon_start_work',
    ])
  })

  it('serves a context pack with stated reasons and a budget', async () => {
    const pack = await callTool<{
      workOrder: { key: string }
      doneWhen: string[]
      items: { reason: string }[]
      budget: { tokens: number; used: number }
    }>('neon_get_context', { work_order_key: 'ATL-102', repo: REMOTE })

    expect(pack.workOrder.key).toBe('ATL-102')
    expect(pack.doneWhen.length).toBeGreaterThan(0)
    expect(pack.items.every((i) => i.reason.length > 0)).toBe(true)
    expect(pack.budget.used).toBeGreaterThan(0)
  })

  it('captures an idea with no repo context and answers with prior rejections', async () => {
    const result = await callTool<{
      idea: { id: string }
      priorRejections: { alternative: string; why: string }[]
      note: string | null
    }>('neon_propose', {
      kind: 'idea',
      title: 'Rerank the top 50 with a cross-encoder',
      body: 'Ordering is visibly wrong on long queries; a cross-encoder would fix it.',
    })

    expect(result.idea.id).toBeTruthy()
    expect(result.priorRejections[0]?.why).toMatch(/latency budget/i)
    expect(result.note).toMatch(/already rejected/)
  })

  it('searches rejected alternatives, not only decisions', async () => {
    const result = await callTool<{ hits: { kind: string; summary: string }[] }>('neon_search', {
      query: 'cross-encoder reranking',
      kind: 'rejected_alternative',
    })
    expect(result.hits.length).toBeGreaterThan(0)
    expect(result.hits[0]!.summary).toMatch(/latency/i)
  })

  it('offers generative material as provocation rather than a ranked list', async () => {
    const material = await callTool<{
      rejectedAlternatives: unknown[]
      contested: unknown[]
      notes: string[]
    }>('neon_generative_context', {})

    expect(material.rejectedAlternatives.length).toBeGreaterThan(0)
    expect(material.contested.length).toBeGreaterThan(0)
    expect(material.notes[0]).toMatch(/not a recommendation/)
  })

  it('drives a whole unit of work: claim, check, finish', async () => {
    // A work order with a check that exists, set up through the API — the MCP
    // surface deliberately has no tool for editing a done_when.
    const repos = await call<{ repos: { id: string; kind: string; remoteUrl: string }[] }>(
      h.app,
      'GET',
      '/api/repos',
    )
    const atlas = repos.body.repos.find((r) => r.remoteUrl === REMOTE)!
    await call(h.app, 'POST', `/api/repos/${atlas.id}/checks`, {
      checks: [{ name: 'noop', kind: 'noop' }],
    })
    const workOrder = await call<{ key: string }>(h.app, 'POST', '/api/work-orders', {
      kind: 'code',
      title: 'Rename the ingest queue metric',
      intent: 'The metric name predates the queue it measures and misleads on call.',
      acceptanceCriteria: ['the metric name matches the queue'],
      doneWhen: [{ check: 'noop' }],
      state: 'ready',
      repoId: atlas.id,
    })

    const started = await callTool<{ changeId: string; branch: string; specPath: string }>(
      'neon_start_work',
      { work_order_key: workOrder.body.key, repo: REMOTE },
    )
    expect(started.branch).toContain(workOrder.body.key.toLowerCase())

    const checked = await callTool<{ passed: boolean; results: { check: string }[] }>('neon_check', {
      change_id: started.changeId,
      config_commit: 'abc1234',
    })
    expect(checked.passed).toBe(true)

    const finished = await callTool<{
      drafts: { prBody: string; commitTrailer: string }
    }>('neon_finish_work', {
      change_id: started.changeId,
      summary: 'Renamed the metric and updated the dashboard.',
    })
    expect(finished.drafts.commitTrailer).toBe(`Neon-Work-Order: ${workOrder.body.key}`)
    expect(finished.drafts.prBody).toContain('Evidence:')
  })

  it('refuses to claim a draft, and says why', async () => {
    await expect(
      callTool('neon_start_work', { work_order_key: 'ATL-104', repo: REMOTE }),
    ).rejects.toThrow(/still a draft/)
  })

  it('tells an agent plainly when its repo is not registered', async () => {
    await expect(
      callTool('neon_start_work', {
        work_order_key: 'ATL-103',
        repo: 'https://github.com/someone/unknown',
      }),
    ).rejects.toThrow(/no registered repo/)
  })
})
