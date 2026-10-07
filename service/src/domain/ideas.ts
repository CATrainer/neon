import { expiryFor, newId, type Idea, type IdeaSource } from '@neon/core'
import { and, eq, lte, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { ideas } from '../db/schema.js'
import type { Ctx } from './ctx.js'
import { recordEvent } from './events.js'
import { invalid, notFound } from './errors.js'

/**
 * The front door. A title and a body, nothing else required — no component, no
 * repo, no rationale. Any friction here kills the whole funnel, so this
 * function has exactly one required argument.
 */
export interface CaptureInput {
  title: string
  body?: string
  source?: IdeaSource
  tags?: string[]
  repoId?: string | null
  /** Supplied by an offline client so its id survives reconciliation. */
  id?: string
}

/** A close match found at capture time. */
export interface IdeaMatch {
  kind: 'open_idea'
  id: string
  title: string
  score: number
  capturedAt: string
}

/**
 * A prior rejection of roughly this idea. Higher value than a duplicate: either
 * the person stops, or they now have a much better idea because they know
 * exactly why the previous version failed.
 */
export interface PriorRejection {
  kind: 'prior_rejection'
  decisionId: string
  decisionKey: string
  decisionTitle: string
  alternative: string
  why: string
  score: number
}

export type IdeaRow = typeof ideas.$inferSelect

export interface CaptureResult {
  idea: IdeaRow
  matches: IdeaMatch[]
  priorRejections: PriorRejection[]
}

const searchTextOf = (title: string, body: string) => `${title}\n${body}`.trim()

export async function captureIdea(ctx: Ctx, input: CaptureInput): Promise<CaptureResult> {
  const title = input.title.trim()
  if (title === '') throw invalid('an idea needs a title')

  const body = (input.body ?? '').trim()
  const now = new Date()
  const searchText = searchTextOf(title, body)
  const row: typeof ideas.$inferInsert = {
    id: input.id ?? newId(),
    title,
    body,
    source: input.source ?? 'manual',
    capturedBy: ctx.actorId,
    capturedAt: now,
    touchedAt: now,
    state: 'open',
    expiresAt: expiryFor(now, ctx.config.ideaTtlDays),
    tags: input.tags ?? [],
    relatedIds: [],
    promotedToWorkOrderId: null,
    repoId: input.repoId ?? null,
    searchText,
  }

  // Looked up before the insert so the new idea cannot match itself.
  const [matches, priorRejections] = await Promise.all([
    findSimilarIdeas(ctx.db, searchText),
    findPriorRejections(ctx.db, searchText),
  ])

  const inserted = await ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(ideas).values(row).returning()
    await recordEvent(tx, {
      kind: 'idea.captured',
      subjectType: 'idea',
      subjectId: row.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { title, source: row.source },
      idempotencyKey: `idea.captured:${row.id}`,
    })
    return created!
  })

  return { idea: inserted, matches, priorRejections }
}

/**
 * Duplicate detection at capture, done synchronously in the response.
 *
 * Trigram similarity, no embeddings: this is the single highest-leverage
 * feature for idea quality and it does not need to be sophisticated to be
 * valuable. `word_similarity` earns its place — a short new title has to be
 * matchable against a long existing body.
 */
export async function findSimilarIdeas(
  db: Db,
  query: string,
  limit = 5,
  threshold = 0.3,
): Promise<IdeaMatch[]> {
  if (query.trim() === '') return []
  const result = await db.execute<{
    id: string
    title: string
    captured_at: Date
    score: number
  }>(sql`
    SELECT id, title, captured_at,
           GREATEST(similarity(search_text, ${query}), word_similarity(${query}, search_text)) AS score
    FROM ideas
    WHERE state = 'open'
      AND GREATEST(similarity(search_text, ${query}), word_similarity(${query}, search_text)) >= ${threshold}
    ORDER BY score DESC
    LIMIT ${limit}
  `)
  return result.rows.map((r) => ({
    kind: 'open_idea' as const,
    id: r.id,
    title: r.title,
    score: Number(r.score),
    capturedAt: new Date(r.captured_at).toISOString(),
  }))
}

export async function findPriorRejections(
  db: Db,
  query: string,
  limit = 5,
  threshold = 0.3,
): Promise<PriorRejection[]> {
  if (query.trim() === '') return []
  const result = await db.execute<{
    id: string
    key: string
    title: string
    alt_title: string
    why: string
    score: number
  }>(sql`
    SELECT d.id, d.key, d.title,
           alt->>'title' AS alt_title,
           alt->>'why'   AS why,
           GREATEST(
             similarity(concat_ws(' ', alt->>'title', alt->>'why'), ${query}),
             word_similarity(${query}, concat_ws(' ', alt->>'title', alt->>'why'))
           ) AS score
    FROM decisions d
    CROSS JOIN LATERAL jsonb_array_elements(d.rejected_alternatives) AS alt
    WHERE d.state <> 'superseded'
      AND GREATEST(
            similarity(concat_ws(' ', alt->>'title', alt->>'why'), ${query}),
            word_similarity(${query}, concat_ws(' ', alt->>'title', alt->>'why'))
          ) >= ${threshold}
    ORDER BY score DESC
    LIMIT ${limit}
  `)
  return result.rows.map((r) => ({
    kind: 'prior_rejection' as const,
    decisionId: r.id,
    decisionKey: r.key,
    decisionTitle: r.title,
    alternative: r.alt_title,
    why: r.why,
    score: Number(r.score),
  }))
}

export async function getIdea(db: Db, id: string): Promise<IdeaRow> {
  const [row] = await db.select().from(ideas).where(eq(ideas.id, id)).limit(1)
  if (!row) throw notFound('idea', id)
  return row
}

export async function listIdeas(
  db: Db,
  opts: { state?: Idea['state']; limit?: number } = {},
): Promise<IdeaRow[]> {
  const q = db.select().from(ideas).$dynamic()
  if (opts.state) q.where(eq(ideas.state, opts.state))
  return q.orderBy(sql`captured_at DESC`).limit(opts.limit ?? 50)
}

/** Touching an idea resets its expiry. Interest is the only thing that keeps
 *  one alive, and it should not require a decision. */
export async function touchIdea(ctx: Ctx, id: string): Promise<IdeaRow> {
  const now = new Date()
  const [row] = await ctx.db
    .update(ideas)
    .set({ touchedAt: now, expiresAt: expiryFor(now, ctx.config.ideaTtlDays) })
    .where(and(eq(ideas.id, id), eq(ideas.state, 'open')))
    .returning()
  if (!row) throw notFound('open idea', id)
  return row
}

export async function discardIdea(ctx: Ctx, id: string): Promise<IdeaRow> {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .update(ideas)
      .set({ state: 'discarded' })
      .where(eq(ideas.id, id))
      .returning()
    if (!row) throw notFound('idea', id)
    await recordEvent(tx, {
      kind: 'idea.discarded',
      subjectType: 'idea',
      subjectId: id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
    })
    return row
  })
}

/**
 * Silent expiry. No notification, no queue, no action required from anyone —
 * that is the entire point. Returns how many went, for the log only.
 */
export async function expireIdeas(db: Db, now = new Date()): Promise<number> {
  const rows = await db
    .update(ideas)
    .set({ state: 'expired' })
    .where(and(eq(ideas.state, 'open'), lte(ideas.expiresAt, now)))
    .returning({ id: ideas.id })
  return rows.length
}
