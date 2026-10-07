import {
  gateViolations,
  newId,
  type DoneWhenClause,
  type WorkOrderKind,
  type WorkOrderState,
} from '@neon/core'
import { desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { ideas, repos, workOrders } from '../db/schema.js'
import type { Ctx } from './ctx.js'
import { recordEvent } from './events.js'
import { conflict, invalid, notFound } from './errors.js'

export type WorkOrderRow = typeof workOrders.$inferSelect

export interface CreateWorkOrderInput {
  kind: WorkOrderKind
  title: string
  intent?: string
  acceptanceCriteria?: string[]
  doneWhen?: DoneWhenClause[]
  declaredComponentIds?: string[]
  repoId?: string | null
  originIdeaId?: string | null
  blockedBy?: string[]
  supersedes?: string | null
  /** Draft unless the caller is explicitly committing to it. */
  state?: WorkOrderState
  id?: string
}

export async function createWorkOrder(
  ctx: Ctx,
  input: CreateWorkOrderInput,
): Promise<WorkOrderRow> {
  const state = input.state ?? 'draft'
  const subject = {
    intent: input.intent ?? '',
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    doneWhen: input.doneWhen ?? [],
  }
  assertGate(state, subject)

  const key = await mintKey(ctx.db, input.repoId ?? null)
  const row: typeof workOrders.$inferInsert = {
    id: input.id ?? newId(),
    key,
    kind: input.kind,
    title: input.title.trim(),
    intent: subject.intent,
    state,
    acceptanceCriteria: subject.acceptanceCriteria,
    doneWhen: subject.doneWhen,
    declaredComponentIds: input.declaredComponentIds ?? [],
    createdBy: ctx.actorId,
    blockedBy: input.blockedBy ?? [],
    supersedes: input.supersedes ?? null,
    originIdeaId: input.originIdeaId ?? null,
    repoId: input.repoId ?? null,
  }
  if (row.title === '') throw invalid('a work order needs a title')

  return ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(workOrders).values(row).returning()
    await recordEvent(tx, {
      kind: 'work_order.created',
      subjectType: 'work_order',
      subjectId: row.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { key, kind: input.kind, state },
      idempotencyKey: `work_order.created:${row.id}`,
    })
    return created!
  })
}

export interface UpdateWorkOrderInput {
  title?: string
  intent?: string
  acceptanceCriteria?: string[]
  doneWhen?: DoneWhenClause[]
  declaredComponentIds?: string[]
  repoId?: string | null
  blockedBy?: string[]
  state?: WorkOrderState
}

export async function updateWorkOrder(
  ctx: Ctx,
  id: string,
  patch: UpdateWorkOrderInput,
): Promise<WorkOrderRow> {
  const current = await getWorkOrder(ctx.db, id)
  const next = {
    intent: patch.intent ?? current.intent,
    acceptanceCriteria: patch.acceptanceCriteria ?? current.acceptanceCriteria,
    doneWhen: patch.doneWhen ?? current.doneWhen,
  }
  const state = patch.state ?? current.state
  assertGate(state, next)

  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(workOrders)
      .set({
        title: patch.title ?? current.title,
        intent: next.intent,
        acceptanceCriteria: next.acceptanceCriteria,
        doneWhen: next.doneWhen,
        declaredComponentIds: patch.declaredComponentIds ?? current.declaredComponentIds,
        repoId: patch.repoId === undefined ? current.repoId : patch.repoId,
        blockedBy: patch.blockedBy ?? current.blockedBy,
        state,
        updatedAt: new Date(),
      })
      .where(eq(workOrders.id, id))
      .returning()

    if (state !== current.state) {
      await recordEvent(tx, {
        kind: 'work_order.state_changed',
        subjectType: 'work_order',
        subjectId: id,
        actorId: ctx.actorId,
        source: ctx.source ?? 'api',
        payload: { from: current.state, to: state },
      })
    } else {
      await recordEvent(tx, {
        kind: 'work_order.updated',
        subjectType: 'work_order',
        subjectId: id,
        actorId: ctx.actorId,
        source: ctx.source ?? 'api',
        payload: { fields: Object.keys(patch) },
      })
    }
    return updated!
  })
}

/**
 * Promotion is the ladder's second gate: someone thinks this is worth doing, so
 * now it needs an intent and acceptance criteria. The drafting of those is the
 * skill's job — this refuses to invent them.
 */
export async function promoteIdea(
  ctx: Ctx,
  ideaId: string,
  input: Omit<CreateWorkOrderInput, 'originIdeaId'>,
): Promise<WorkOrderRow> {
  const [idea] = await ctx.db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1)
  if (!idea) throw notFound('idea', ideaId)
  if (idea.state === 'promoted') {
    throw conflict(`idea ${ideaId} was already promoted to ${idea.promotedToWorkOrderId}`)
  }

  const workOrder = await createWorkOrder(ctx, {
    ...input,
    title: input.title || idea.title,
    originIdeaId: ideaId,
    repoId: input.repoId ?? idea.repoId,
  })

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(ideas)
      .set({ state: 'promoted', promotedToWorkOrderId: workOrder.id })
      .where(eq(ideas.id, ideaId))
    await recordEvent(tx, {
      kind: 'idea.promoted',
      subjectType: 'idea',
      subjectId: ideaId,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { workOrderId: workOrder.id, key: workOrder.key },
    })
  })

  return workOrder
}

export async function getWorkOrder(db: Db, id: string): Promise<WorkOrderRow> {
  const [row] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1)
  if (!row) throw notFound('work order', id)
  return row
}

export async function getWorkOrderByKey(db: Db, key: string): Promise<WorkOrderRow> {
  const [row] = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.key, key.toUpperCase()))
    .limit(1)
  if (!row) throw notFound('work order', key)
  return row
}

export async function listWorkOrders(
  db: Db,
  opts: { state?: WorkOrderState; kind?: WorkOrderKind; limit?: number } = {},
): Promise<WorkOrderRow[]> {
  const q = db.select().from(workOrders).$dynamic()
  const clauses = []
  if (opts.state) clauses.push(eq(workOrders.state, opts.state))
  if (opts.kind) clauses.push(eq(workOrders.kind, opts.kind))
  if (clauses.length) q.where(sql.join(clauses, sql` AND `))
  return q.orderBy(desc(workOrders.createdAt)).limit(opts.limit ?? 100)
}

function assertGate(
  state: WorkOrderState,
  subject: { intent: string; acceptanceCriteria: string[]; doneWhen: DoneWhenClause[] },
): void {
  const violations = gateViolations(state, subject)
  if (violations.length > 0) {
    throw invalid(`work order cannot be ${state}: ${violations.join('; ')}`, { violations })
  }
}

async function mintKey(db: Db, repoId: string | null): Promise<string> {
  let prefix = 'WO'
  if (repoId) {
    const [repo] = await db
      .select({ keyPrefix: repos.keyPrefix })
      .from(repos)
      .where(eq(repos.id, repoId))
      .limit(1)
    if (repo) prefix = repo.keyPrefix
  }
  const result = await db.execute<{ nextval: string }>(
    sql`SELECT nextval('work_order_key_seq') AS nextval`,
  )
  return `${prefix}-${result.rows[0]!.nextval}`
}
