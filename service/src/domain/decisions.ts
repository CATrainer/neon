import {
  citabilityGaps,
  newId,
  type DecisionPosition,
  type DecisionState,
  type RejectedAlternative,
} from '@neon/core'
import { desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { checks, decisionEvidence, decisions, runs } from '../db/schema.js'
import type { Ctx } from './ctx.js'
import { recordEvent } from './events.js'
import { invalid, notFound } from './errors.js'

export type DecisionRow = typeof decisions.$inferSelect

export interface CreateDecisionInput {
  title: string
  rationale: string
  rejectedAlternatives?: RejectedAlternative[]
  componentIds?: string[]
  state?: DecisionState
  settlingCondition?: string | null
  positions?: DecisionPosition[]
  workOrderIds?: string[]
  supersedes?: string | null
  /** Reference to the full record in git, plus its hash. Neon does not hold
   *  the text: the record lives in the knowledge repo. */
  recordRef?: string | null
  recordContentHash?: string | null
  /** When it was decided, if that was before it reached Neon: an imported
   *  record keeps its own date. Defaults to now. */
  decidedAt?: Date | null
  id?: string
  key?: string
}

const searchTextOf = (input: {
  title: string
  rationale: string
  rejectedAlternatives?: RejectedAlternative[]
}) =>
  [
    input.title,
    input.rationale,
    ...(input.rejectedAlternatives ?? []).flatMap((a) => [a.title, a.why]),
  ]
    .join('\n')
    .trim()

export async function createDecision(ctx: Ctx, input: CreateDecisionInput): Promise<DecisionRow> {
  const title = input.title.trim()
  if (title === '') throw invalid('a decision needs a title')

  // A contested decision without a settling condition is just an argument with
  // a database row. Ask for what would resolve it while people still know.
  if (input.state === 'contested' && !input.settlingCondition?.trim()) {
    throw invalid('a contested decision needs a settling_condition: what evidence would settle it')
  }

  const row: typeof decisions.$inferInsert = {
    id: input.id ?? newId(),
    key: input.key ?? (await mintKey(ctx.db)),
    title,
    rationale: input.rationale ?? '',
    rejectedAlternatives: input.rejectedAlternatives ?? [],
    componentIds: input.componentIds ?? [],
    state: input.state ?? 'proposed',
    supersedes: input.supersedes ?? null,
    settlingCondition: input.settlingCondition ?? null,
    positions: input.positions ?? [],
    authorId: ctx.actorId,
    workOrderIds: input.workOrderIds ?? [],
    recordRef: input.recordRef ?? null,
    recordContentHash: input.recordContentHash ?? null,
    ...(input.decidedAt ? { decidedAt: input.decidedAt } : {}),
    searchText: searchTextOf({ ...input, title }),
  }

  return ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(decisions).values(row).returning()
    if (input.supersedes) {
      await tx
        .update(decisions)
        .set({ state: 'superseded', supersededBy: row.id })
        .where(eq(decisions.id, input.supersedes))
    }
    await recordEvent(tx, {
      kind: 'decision.recorded',
      subjectType: 'decision',
      subjectId: row.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { key: row.key, state: row.state },
      idempotencyKey: `decision.recorded:${row.id}`,
    })
    return created!
  })
}

/**
 * Attaching evidence. A run that isn't citable cannot be cited, and the refusal
 * says which pin is missing — the point is to get the run pinned, not to argue
 * about the rule.
 */
export async function attachEvidence(
  ctx: Ctx,
  decisionId: string,
  runId: string,
): Promise<void> {
  const [run] = await ctx.db
    .select({
      id: runs.id,
      citable: runs.citable,
      artifactVersion: runs.artifactVersion,
      configCommit: runs.configCommit,
      fixtureVersion: runs.fixtureVersion,
      paramsHash: runs.paramsHash,
      checkKind: checks.kind,
      requiresFixture: checks.requiresFixture,
    })
    .from(runs)
    .innerJoin(checks, eq(checks.id, runs.checkId))
    .where(eq(runs.id, runId))
    .limit(1)
  if (!run) throw notFound('run', runId)

  if (!run.citable) {
    const gaps = citabilityGaps(run)
    throw invalid(
      `run ${runId} is not citable and cannot be evidence: ${gaps.join('; ')}. Record those pins when the run is made — they cannot be added afterwards.`,
      { runId, gaps },
    )
  }

  await ctx.db.transaction(async (tx) => {
    await tx
      .insert(decisionEvidence)
      .values({ decisionId, runId })
      .onConflictDoNothing()
    await recordEvent(tx, {
      kind: 'decision.evidence_attached',
      subjectType: 'decision',
      subjectId: decisionId,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { runId },
    })
  })
}

export async function listEvidence(db: Db, decisionId: string): Promise<string[]> {
  const rows = await db
    .select({ runId: decisionEvidence.runId })
    .from(decisionEvidence)
    .where(eq(decisionEvidence.decisionId, decisionId))
  return rows.map((r) => r.runId)
}

export async function getDecision(db: Db, idOrKey: string): Promise<DecisionRow> {
  const [row] = await db
    .select()
    .from(decisions)
    .where(sql`id = ${idOrKey} OR key = ${idOrKey.toUpperCase()}`)
    .limit(1)
  if (!row) throw notFound('decision', idOrKey)
  return row
}

export async function listDecisions(
  db: Db,
  opts: { state?: DecisionState; componentId?: string; limit?: number } = {},
): Promise<DecisionRow[]> {
  const q = db.select().from(decisions).$dynamic()
  const clauses = []
  if (opts.state) clauses.push(eq(decisions.state, opts.state))
  if (opts.componentId) clauses.push(sql`${decisions.componentIds} @> ARRAY[${opts.componentId}]::text[]`)
  if (clauses.length) q.where(sql.join(clauses, sql` AND `))
  return q.orderBy(desc(decisions.decidedAt)).limit(opts.limit ?? 100)
}

async function mintKey(db: Db): Promise<string> {
  const result = await db.execute<{ nextval: string }>(
    sql`SELECT nextval('decision_key_seq') AS nextval`,
  )
  return `D-${result.rows[0]!.nextval}`
}
