import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { call, startHarness, type Harness } from './harness.js'

/**
 * The front door and what makes it worth walking through: capture costs
 * nothing, and what comes back is the reason someone already rejected this.
 */
let h: Harness

beforeAll(async () => {
  h = await startHarness('capture')
})
afterAll(async () => {
  await h.close()
})

describe('capture', () => {
  it('accepts a title alone', async () => {
    const res = await call<{ idea: { title: string; state: string; expiresAt: string } }>(
      h.app,
      'POST',
      '/api/ideas',
      { title: 'Cache embeddings across eval runs' },
    )
    expect(res.status).toBe(201)
    expect(res.body.idea.state).toBe('open')
    // Expiry is set at capture, silently, with no action required from anyone.
    expect(new Date(res.body.idea.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('surfaces close matches among open ideas', async () => {
    await call(h.app, 'POST', '/api/ideas', {
      title: 'Add a cross-encoder reranker',
      body: 'Rerank the top 50 candidates with a cross-encoder for much better ordering.',
    })

    const res = await call<{ matches: { title: string; score: number }[] }>(
      h.app,
      'POST',
      '/api/ideas',
      {
        title: 'Rerank candidates with a cross-encoder',
        body: 'A cross-encoder over the top 50 would order results much better.',
      },
    )
    expect(res.body.matches.length).toBeGreaterThan(0)
    expect(res.body.matches[0]!.title).toMatch(/cross-encoder/i)
  })

  it('surfaces the prior rejection and its reason', async () => {
    await call(h.app, 'POST', '/api/decisions', {
      title: 'Retrieval is dense-only for now',
      rationale: 'One index to operate and tune.',
      state: 'accepted',
      rejectedAlternatives: [
        {
          title: 'Cross-encoder reranking of the top 50',
          why: 'The latency budget was 200ms end to end and the reranker alone was 340ms on the hardware we had.',
        },
      ],
    })

    const res = await call<{
      priorRejections: { alternative: string; why: string; decisionKey: string }[]
    }>(h.app, 'POST', '/api/ideas', {
      title: 'Cross-encoder reranking of the top 50 results',
      body: 'Rerank the top 50 with a cross-encoder.',
    })

    expect(res.body.priorRejections.length).toBeGreaterThan(0)
    const rejection = res.body.priorRejections[0]!
    expect(rejection.alternative).toMatch(/cross-encoder/i)
    expect(rejection.why).toMatch(/latency budget/)
    expect(rejection.decisionKey).toMatch(/^D-\d+$/)
  })

  it('finds rejected alternatives through search, not only at capture', async () => {
    const res = await call<{ hits: { kind: string; title: string; summary: string }[] }>(
      h.app,
      'GET',
      '/api/search?q=cross-encoder%20reranking',
    )
    expect(res.body.hits.some((hit) => hit.kind === 'rejected_alternative')).toBe(true)
  })

  it('expires quietly, and expired ideas stop matching', async () => {
    const captured = await call<{ idea: { id: string; title: string } }>(
      h.app,
      'POST',
      '/api/ideas',
      { title: 'Shard the index by tenant', body: 'Tenant-sharded index for isolation.' },
    )

    await h.handle.db.execute(
      sql`UPDATE ideas SET expires_at = now() - interval '1 day' WHERE id = ${captured.body.idea.id}`,
    )

    const swept = await call<{ expired: number }>(
      h.app,
      'POST',
      '/api/maintenance/expire-ideas',
      {},
    )
    expect(swept.body.expired).toBe(1)

    const again = await call<{ matches: unknown[] }>(h.app, 'POST', '/api/ideas', {
      title: 'Shard the index by tenant',
      body: 'Tenant-sharded index for isolation.',
    })
    expect(again.body.matches).toHaveLength(0)
  })
})
