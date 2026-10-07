import { daysUntilExpiry, newId } from '@neon/core'
import { sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { contextPacks } from '../db/schema.js'

/**
 * Generative context.
 *
 * Execution context narrows; this provokes. It is raw material for a human and
 * an agent to think with, and it is deliberately not a ranked recommendation
 * list — the moment it starts telling people what to do, it stops being
 * material and becomes another backlog.
 *
 * The highest-yield input is the rejected alternative: something already
 * reasoned about and discarded for a stated reason that may since have expired.
 * Neon surfaces the material and leaves the judgment to a person; detecting an
 * expired constraint automatically is explicitly out of scope.
 */

export interface RejectedAlternativeMaterial {
  decisionRef: string
  decisionTitle: string
  alternative: string
  blockedBy: string
  originalRationale: string
  decidedDaysAgo: number
}

export interface ContestedMaterial {
  decisionRef: string
  title: string
  positions: { holder: string; summary: string }[]
  settlingCondition: string | null
}

export interface FrictionMaterial {
  kind: 'component_churn' | 'failing_check'
  ref: string
  detail: string
  count: number
}

export interface AgeingIdeaMaterial {
  id: string
  title: string
  summary: string
  daysLeft: number
}

export interface GenerativeContext {
  focus: string | null
  rejectedAlternatives: RejectedAlternativeMaterial[]
  contested: ContestedMaterial[]
  friction: FrictionMaterial[]
  ageingIdeas: AgeingIdeaMaterial[]
  notes: string[]
  packId: string
}

export interface GenerativeOptions {
  focus?: string | null
  requestedBy?: string | null
  limit?: number
  log?: boolean
  now?: Date
}

export async function assembleGenerativeContext(
  db: Db,
  options: GenerativeOptions = {},
): Promise<GenerativeContext> {
  const limit = options.limit ?? 6
  const focus = options.focus?.trim() || null
  const now = options.now ?? new Date()

  const rejected = await rejectedAlternatives(db, focus, limit)
  const contested = await contestedDecisions(db, limit)
  const friction = await recurringFriction(db, limit)
  const ageing = await ageingIdeas(db, limit, now)

  const notes = [
    'This is material, not a recommendation. The blocking constraint on a rejected alternative may or may not still hold — that judgment is yours.',
  ]
  if (focus) notes.push(`filtered to material matching "${focus}"`)
  if (rejected.length === 0 && contested.length === 0 && friction.length === 0) {
    notes.push('the corpus is thin: there is not much here to think with yet')
  }

  const packId = newId()
  const context: GenerativeContext = {
    focus,
    rejectedAlternatives: rejected,
    contested,
    friction,
    ageingIdeas: ageing,
    notes,
    packId,
  }

  if (options.log !== false) {
    await db.insert(contextPacks).values({
      id: packId,
      workOrderId: null,
      repoId: null,
      requestedBy: options.requestedBy ?? null,
      purpose: 'generative',
      assemblerVersion: '1',
      budgetTokens: 0,
      usedTokens: 0,
      items: [...rejected, ...contested, ...friction, ...ageing],
      omitted: [],
    })
  }

  return context
}

async function rejectedAlternatives(
  db: Db,
  focus: string | null,
  limit: number,
): Promise<RejectedAlternativeMaterial[]> {
  const rows = await db.execute<{
    key: string
    title: string
    rationale: string
    alt_title: string
    why: string
    decided_at: Date
    score: number
  }>(sql`
    SELECT d.key, d.title, d.rationale,
           alt->>'title' AS alt_title,
           alt->>'why'   AS why,
           d.decided_at,
           CASE WHEN ${focus}::text IS NULL THEN 0
                ELSE GREATEST(
                  similarity(concat_ws(' ', alt->>'title', alt->>'why'), ${focus}),
                  word_similarity(${focus}, concat_ws(' ', alt->>'title', alt->>'why'))
                )
           END AS score
    FROM decisions d
    CROSS JOIN LATERAL jsonb_array_elements(d.rejected_alternatives) AS alt
    WHERE d.state <> 'superseded'
      AND (${focus}::text IS NULL
           OR GREATEST(
                similarity(concat_ws(' ', alt->>'title', alt->>'why'), ${focus}),
                word_similarity(${focus}, concat_ws(' ', alt->>'title', alt->>'why'))
              ) >= 0.2)
    ORDER BY score DESC, d.decided_at ASC
    LIMIT ${limit}
  `)

  const day = 24 * 60 * 60 * 1000
  return rows.rows.map((r) => ({
    decisionRef: r.key,
    decisionTitle: r.title,
    alternative: r.alt_title,
    blockedBy: r.why,
    originalRationale: r.rationale,
    decidedDaysAgo: Math.round((Date.now() - new Date(r.decided_at).getTime()) / day),
  }))
}

async function contestedDecisions(db: Db, limit: number): Promise<ContestedMaterial[]> {
  const rows = await db.execute<{
    key: string
    title: string
    positions: { holder: string; summary: string }[]
    settling_condition: string | null
  }>(sql`
    SELECT key, title, positions, settling_condition
    FROM decisions
    WHERE state = 'contested'
    ORDER BY decided_at DESC
    LIMIT ${limit}
  `)
  return rows.rows.map((r) => ({
    decisionRef: r.key,
    title: r.title,
    positions: r.positions ?? [],
    settlingCondition: r.settling_condition,
  }))
}

/**
 * Patterns Neon can see and nobody else can: a component that keeps appearing
 * in recent work, and a check that keeps failing. Both are usually a design
 * problem wearing a schedule's clothes.
 */
async function recurringFriction(db: Db, limit: number): Promise<FrictionMaterial[]> {
  const churn = await db.execute<{ name: string; count: string }>(sql`
    SELECT c.name, count(*) AS count
    FROM work_orders w
    CROSS JOIN LATERAL unnest(w.declared_component_ids) AS cid
    JOIN components c ON c.id = cid
    WHERE w.created_at > now() - interval '90 days'
    GROUP BY c.name
    HAVING count(*) >= 3
    ORDER BY count(*) DESC
    LIMIT ${limit}
  `)

  const failing = await db.execute<{ name: string; count: string }>(sql`
    SELECT ch.name, count(*) AS count
    FROM runs r
    JOIN checks ch ON ch.id = r.check_id
    WHERE r.result <> 'pass' AND r.started_at > now() - interval '30 days'
    GROUP BY ch.name
    HAVING count(*) >= 2
    ORDER BY count(*) DESC
    LIMIT ${limit}
  `)

  return [
    ...churn.rows.map((r) => ({
      kind: 'component_churn' as const,
      ref: r.name,
      detail: `${r.count} work orders in the last 90 days touched ${r.name}`,
      count: Number(r.count),
    })),
    ...failing.rows.map((r) => ({
      kind: 'failing_check' as const,
      ref: r.name,
      detail: `${r.name} has failed ${r.count} times in the last 30 days`,
      count: Number(r.count),
    })),
  ]
}

async function ageingIdeas(db: Db, limit: number, now: Date): Promise<AgeingIdeaMaterial[]> {
  const rows = await db.execute<{
    id: string
    title: string
    body: string
    expires_at: Date
  }>(sql`
    SELECT id, title, body, expires_at
    FROM ideas
    WHERE state = 'open' AND expires_at < now() + interval '21 days'
    ORDER BY expires_at ASC
    LIMIT ${limit}
  `)
  return rows.rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.body.slice(0, 200),
    daysLeft: Math.round(daysUntilExpiry(new Date(r.expires_at), now)),
  }))
}
