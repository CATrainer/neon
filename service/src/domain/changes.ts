import { newId } from '@neon/core'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { changes, workOrders } from '../db/schema.js'
import type { Ctx } from './ctx.js'
import { recordEvent } from './events.js'
import { conflict, invalid, notFound } from './errors.js'
import { getRepo } from './repos.js'
import { latestVerdict, type CheckReport } from './runs.js'
import { getWorkOrderByKey, type WorkOrderRow } from './workOrders.js'

export type ChangeRow = typeof changes.$inferSelect

/** States in which a change is still someone's live work. */
const LIVE: ReadonlyArray<ChangeRow['state']> = ['claimed', 'open', 'in_review']

export interface StartWorkInput {
  workOrderKey: string
  repoId: string
  /** Supplied by an offline client so the claim keeps its identity. */
  id?: string
}

export interface StartWorkResult {
  change: ChangeRow
  workOrder: WorkOrderRow
  branch: string
  /** Where the change's record belongs in git. Code work gets an OpenSpec
   *  change folder; inquiry work gets a record in the knowledge repo. The
   *  plugin scaffolds it — the service only says where. */
  specPath: string
  /** True when this call found an existing claim rather than making one. */
  resumed: boolean
}

/**
 * Claiming work. This is the one place in the loop that genuinely needs the
 * server: two people cannot claim the same work order, and that cannot be
 * settled offline.
 */
export async function startWork(ctx: Ctx, input: StartWorkInput): Promise<StartWorkResult> {
  const workOrder = await getWorkOrderByKey(ctx.db, input.workOrderKey)
  const repo = await getRepo(ctx.db, input.repoId)

  if (workOrder.state === 'draft') {
    throw invalid(
      `work order ${workOrder.key} is still a draft: it needs a done_when before anyone commits to it`,
    )
  }
  if (workOrder.state === 'done' || workOrder.state === 'abandoned') {
    throw conflict(`work order ${workOrder.key} is ${workOrder.state}`)
  }

  // Kind decides what a change produces, and a knowledge repo cannot hold
  // commits of code work any more than a code repo should hold records.
  if (workOrder.kind === 'code' && repo.kind === 'knowledge') {
    throw invalid(`work order ${workOrder.key} is code work; ${repo.name} is a knowledge repo`)
  }
  if (workOrder.kind === 'inquiry' && repo.kind === 'code') {
    throw invalid(
      `work order ${workOrder.key} is inquiry work and produces records, not commits; point it at a knowledge repo`,
    )
  }

  const existing = await findLiveChange(ctx.db, workOrder.id, repo.id)
  if (existing) {
    if (existing.claimedBy && existing.claimedBy !== ctx.actorId) {
      throw conflict(`${workOrder.key} is already claimed by ${existing.claimedBy}`)
    }
    return {
      change: existing,
      workOrder,
      branch: existing.branch,
      specPath: existing.specRef ?? specPathFor(workOrder),
      resumed: true,
    }
  }

  const branch = branchFor(workOrder)
  const specPath = specPathFor(workOrder)
  const row: typeof changes.$inferInsert = {
    id: input.id ?? newId(),
    workOrderId: workOrder.id,
    repoId: repo.id,
    branch,
    specRef: specPath,
    dependsOn: [],
    state: 'claimed',
    claimedBy: ctx.actorId,
  }

  const change = await ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(changes).values(row).returning()
    if (workOrder.state === 'ready' || workOrder.state === 'blocked') {
      await tx
        .update(workOrders)
        .set({ state: 'in_progress', updatedAt: new Date() })
        .where(eq(workOrders.id, workOrder.id))
    }
    await recordEvent(tx, {
      kind: 'change.claimed',
      subjectType: 'change',
      subjectId: row.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { workOrderKey: workOrder.key, repoId: repo.id, branch },
      idempotencyKey: `change.claimed:${row.id}`,
    })
    return created!
  })

  return { change, workOrder, branch, specPath, resumed: false }
}

export interface FinishWorkInput {
  changeId: string
  summary: string
  prUrl?: string | null
  specContentHash?: string | null
  /** The commit being finished. Runs recorded at any other commit are stale. */
  atCommit?: string | null
  /** A person finishing over a failing definition of done, and why. Offered by
   *  the CLI behind an interactive confirmation, never on the MCP surface. */
  override?: { reason: string } | null
}

export interface FinishWorkResult {
  change: ChangeRow
  /** What the finish was judged on: the latest runs, not a fresh execution. */
  verdict: CheckReport
  overridden: boolean
}

/**
 * Records completion. It does not decide that the work is done — the checks do
 * that — so it refuses while the latest runs of the definition of done fail,
 * unless a person overrides with a reason. It runs nothing itself, and writes
 * nothing to the repo.
 */
export async function finishWork(ctx: Ctx, input: FinishWorkInput): Promise<FinishWorkResult> {
  const change = await getChange(ctx.db, input.changeId)
  const verdict = await latestVerdict(ctx.db, change.id, { atCommit: input.atCommit ?? null })
  const reason = input.override?.reason.trim() ?? ''

  if (!verdict.passed && reason === '') {
    const failing = verdict.problem
      ? [verdict.problem]
      : verdict.results
          .filter((r) => r.result !== 'pass' || r.thresholdViolation)
          .map((r) => `${r.check}: ${r.thresholdViolation ?? r.failureSummary ?? r.result}`)
    throw conflict(
      `${verdict.workOrderKey} cannot finish while its definition of done fails — ${failing.join('; ')}. Fix the work and run neon_check again. Only a person can finish over failing checks, with \`neon finish --override "<reason>"\` in a terminal.`,
      { verdict },
    )
  }

  const updated = await ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(changes)
      .set({
        state: change.prUrl || input.prUrl ? 'in_review' : 'open',
        prUrl: input.prUrl ?? change.prUrl,
        specContentHash: input.specContentHash ?? change.specContentHash,
        updatedAt: new Date(),
      })
      .where(eq(changes.id, change.id))
      .returning()

    await tx
      .update(workOrders)
      .set({ state: 'review', updatedAt: new Date() })
      .where(eq(workOrders.id, change.workOrderId))

    await recordEvent(tx, {
      kind: 'change.finished',
      subjectType: 'change',
      subjectId: change.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: {
        summary: input.summary,
        prUrl: input.prUrl ?? null,
        // An override is the thing an auditor will look for, so it travels
        // with the verdict it overrode.
        override: verdict.passed ? null : { reason },
        verdict: {
          passed: verdict.passed,
          results: verdict.results.map((r) => ({ check: r.check, result: r.result, runId: r.runId })),
        },
      },
    })
    return updated!
  })

  return { change: updated, verdict, overridden: !verdict.passed }
}

export async function abandonChange(ctx: Ctx, id: string, reason?: string): Promise<ChangeRow> {
  return ctx.db.transaction(async (tx) => {
    const [updated] = await tx
      .update(changes)
      .set({ state: 'abandoned', updatedAt: new Date() })
      .where(eq(changes.id, id))
      .returning()
    if (!updated) throw notFound('change', id)
    await recordEvent(tx, {
      kind: 'change.abandoned',
      subjectType: 'change',
      subjectId: id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { reason: reason ?? null },
    })
    return updated
  })
}

export async function getChange(db: Db, id: string): Promise<ChangeRow> {
  const [row] = await db.select().from(changes).where(eq(changes.id, id)).limit(1)
  if (!row) throw notFound('change', id)
  return row
}

export async function findLiveChange(
  db: Db,
  workOrderId: string,
  repoId: string,
): Promise<ChangeRow | undefined> {
  const [row] = await db
    .select()
    .from(changes)
    .where(
      and(
        eq(changes.workOrderId, workOrderId),
        eq(changes.repoId, repoId),
        inArray(changes.state, [...LIVE]),
      ),
    )
    .limit(1)
  return row
}

/** The active change for a checkout: what the Stop hook and SessionStart need. */
export async function findActiveChangeForBranch(
  db: Db,
  repoId: string,
  branch: string,
): Promise<ChangeRow | undefined> {
  const [row] = await db
    .select()
    .from(changes)
    .where(
      and(
        eq(changes.repoId, repoId),
        eq(changes.branch, branch),
        inArray(changes.state, [...LIVE]),
      ),
    )
    .limit(1)
  return row
}

export async function listChanges(db: Db, repoId?: string): Promise<ChangeRow[]> {
  const q = db.select().from(changes).$dynamic()
  if (repoId) q.where(eq(changes.repoId, repoId))
  return q.orderBy(desc(changes.createdAt)).limit(100)
}

export function slug(text: string, max = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

/** Branch names carry the key so a commit can be traced back without Neon. */
export function branchFor(workOrder: Pick<WorkOrderRow, 'key' | 'title' | 'kind'>): string {
  const prefix = workOrder.kind === 'inquiry' ? 'inquiry' : 'work'
  return `neon/${prefix}/${workOrder.key.toLowerCase()}-${slug(workOrder.title)}`
}

/**
 * Code work produces an OpenSpec change folder; inquiry work produces a record
 * in the knowledge repo. Same machinery, different output.
 */
export function specPathFor(workOrder: Pick<WorkOrderRow, 'key' | 'title' | 'kind'>): string {
  const name = `${workOrder.key.toLowerCase()}-${slug(workOrder.title)}`
  return workOrder.kind === 'inquiry'
    ? `records/${name}.md`
    : `openspec/changes/${name}/proposal.md`
}
