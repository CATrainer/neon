import {
  deriveCitable,
  hashParams,
  newId,
  type DoneWhenClause,
  type RunArtifact,
  type RunTrigger,
} from '@neon/core'
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { getAdapter } from '../checks/registry.js'
import type { CheckOutcome, Params, RunPins } from '../checks/types.js'
import type { Db } from '../db/client.js'
import { changes, checks, repos, runs, workOrders } from '../db/schema.js'
import type { Ctx } from './ctx.js'
import { recordEvent } from './events.js'
import { DomainError, invalid, notFound } from './errors.js'
import { findCheck, resolveCheck } from './checks.js'

export type RunRow = typeof runs.$inferSelect

export interface CheckClauseResult {
  check: string
  result: 'pass' | 'fail' | 'error'
  /** null when the clause could not produce a run at all — an unregistered
   *  check has nothing to record a run against. */
  runId: string | null
  score: number | null
  citable: boolean
  failureSummary: string | null
  /** Why the threshold failed, when the check itself passed. */
  thresholdViolation: string | null
}

export interface CheckReport {
  changeId: string
  workOrderKey: string
  passed: boolean
  results: CheckClauseResult[]
  /** Present when there is nothing to check, which is itself a failure of the
   *  ladder rather than of the work. */
  problem?: string
}

export interface RunDoneWhenInput {
  changeId: string
  /** Absolute path to the checkout, for adapters that need a working tree. */
  workdir?: string | null
  trigger?: RunTrigger
  /** Pins the caller can supply: CI knows the artifact version, the CLI knows
   *  the commit. Adapters may add to these. */
  pins?: RunPins
}

/**
 * Resolves a work order's `done_when` and executes it. This is what makes
 * "done" mean something: the definition is data, the verdict is a run, and the
 * evidence outlives the conversation.
 */
export async function runDoneWhen(ctx: Ctx, input: RunDoneWhenInput): Promise<CheckReport> {
  const [change] = await ctx.db.select().from(changes).where(eq(changes.id, input.changeId)).limit(1)
  if (!change) throw notFound('change', input.changeId)

  const [workOrder] = await ctx.db
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, change.workOrderId))
    .limit(1)
  if (!workOrder) throw notFound('work order', change.workOrderId)

  const [repo] = await ctx.db.select().from(repos).where(eq(repos.id, change.repoId)).limit(1)

  if (workOrder.doneWhen.length === 0) {
    return {
      changeId: change.id,
      workOrderKey: workOrder.key,
      passed: false,
      results: [],
      problem: `work order ${workOrder.key} has an empty done_when: there is nothing to check`,
    }
  }

  const results: CheckClauseResult[] = []
  for (const clause of workOrder.doneWhen) {
    try {
      results.push(
        await runClause(ctx, {
          clause,
          change,
          workOrder,
          repo: repo ?? null,
          workdir: input.workdir ?? repo?.localPath ?? null,
          trigger: input.trigger ?? 'local',
          pins: input.pins ?? {},
        }),
      )
    } catch (err) {
      // A clause naming a check this repo does not have is a failure of the
      // work order, not a reason to abandon the whole report. It must still
      // block: a definition of done nobody can execute is not satisfied.
      if (err instanceof DomainError) {
        results.push({
          check: clause.check,
          result: 'error',
          runId: null,
          score: null,
          citable: false,
          failureSummary: `${err.message}. Declare it in neon.checks.yaml and run \`neon checks sync\`, or correct the work order's done_when.`,
          thresholdViolation: null,
        })
        continue
      }
      throw err
    }
  }

  return {
    changeId: change.id,
    workOrderKey: workOrder.key,
    passed: results.every((r) => r.result === 'pass' && r.thresholdViolation === null),
    results,
  }
}

interface RunClauseInput {
  clause: DoneWhenClause
  change: typeof changes.$inferSelect
  workOrder: typeof workOrders.$inferSelect
  repo: typeof repos.$inferSelect | null
  workdir: string | null
  trigger: RunTrigger
  pins: RunPins
}

async function runClause(ctx: Ctx, input: RunClauseInput): Promise<CheckClauseResult> {
  const check = await resolveCheck(ctx.db, input.change.repoId, input.clause.check)
  const adapter = getAdapter(check.kind)
  if (!adapter) throw invalid(`no adapter registered for check kind "${check.kind}"`)

  const params: Params = { ...check.defaultParams, ...(input.clause.params ?? {}) }
  const startedAt = new Date()
  const logLines: string[] = []

  let outcome: CheckOutcome
  try {
    outcome = await adapter.run({
      check,
      params,
      threshold: input.clause.threshold,
      workOrder: input.workOrder,
      change: input.change,
      repo: input.repo,
      workdir: input.workdir,
      log: (m) => logLines.push(m),
    })
  } catch (err) {
    // An adapter that throws is an error, not a failure: the difference matters
    // when deciding whether the work is wrong or the machinery is.
    outcome = {
      result: 'error',
      failureSummary: `check ${check.name} could not run: ${(err as Error).message}`,
    }
  }

  const pins: RunPins = { ...input.pins, ...(outcome.pins ?? {}) }
  const paramsHash = hashParams(params)
  const citable = deriveCitable({
    checkKind: check.kind,
    requiresFixture: check.requiresFixture,
    artifactVersion: pins.artifactVersion,
    configCommit: pins.configCommit,
    fixtureVersion: pins.fixtureVersion,
    paramsHash,
  })

  const { violation, baselineRunId, delta } = await evaluateThreshold(
    ctx.db,
    input.clause,
    check.id,
    paramsHash,
    outcome.score ?? null,
  )

  const artifacts: RunArtifact[] = [...(outcome.artifacts ?? [])]
  if (logLines.length > 0) {
    artifacts.push({
      id: newId(),
      name: 'check.log',
      kind: 'log',
      sizeBytes: logLines.join('\n').length,
      preview: logLines.slice(-20).join('\n'),
    })
  }

  const row: typeof runs.$inferInsert = {
    id: newId(),
    checkId: check.id,
    changeId: input.change.id,
    workOrderId: input.workOrder.id,
    startedAt,
    endedAt: new Date(),
    artifactVersion: pins.artifactVersion ?? null,
    configCommit: pins.configCommit ?? null,
    fixtureVersion: pins.fixtureVersion ?? null,
    paramsResolved: params,
    paramsHash,
    result: outcome.result,
    score: outcome.score ?? null,
    baselineRunId,
    delta,
    artifacts,
    trigger: input.trigger,
    triggeredBy: ctx.actorId,
    citable,
    failureSummary: outcome.failureSummary ?? violation ?? null,
    evaluatorModel: outcome.evaluatorModel ?? null,
  }

  await ctx.db.transaction(async (tx) => {
    await tx.insert(runs).values(row)
    await recordEvent(tx, {
      kind: 'run.recorded',
      subjectType: 'run',
      subjectId: row.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { check: check.name, result: outcome.result, citable },
      idempotencyKey: `run.recorded:${row.id}`,
    })
  })

  return {
    check: check.name,
    result: outcome.result,
    runId: row.id,
    score: outcome.score ?? null,
    citable,
    failureSummary: outcome.failureSummary ?? null,
    thresholdViolation: violation,
  }
}

/**
 * Thresholds live on the work order, not on the check: the same check has
 * different bars for different work.
 *
 * `no_regression_vs: baseline` compares against the most recent passing run of
 * the same check with the same parameters that was not part of this change —
 * a deliberately simple definition of "baseline" for this phase, and one that
 * the eval work in Phase 2 will need to replace with a named baseline.
 */
async function evaluateThreshold(
  db: Db,
  clause: DoneWhenClause,
  checkId: string,
  paramsHash: string,
  score: number | null,
): Promise<{ violation: string | null; baselineRunId: string | null; delta: number | null }> {
  let baseline: { id: string; score: number } | null = null
  if (clause.threshold?.noRegressionVs === 'baseline' && score !== null) {
    const [row] = await db
      .select({ id: runs.id, score: runs.score })
      .from(runs)
      .where(
        and(
          eq(runs.checkId, checkId),
          eq(runs.paramsHash, paramsHash),
          eq(runs.result, 'pass'),
          isNotNull(runs.score),
        ),
      )
      .orderBy(desc(runs.startedAt))
      .limit(1)
    if (row?.score != null) baseline = { id: row.id, score: row.score }
  }
  return judgeScore(clause, score, baseline)
}

/**
 * Whether a score meets a clause's threshold. Pure, so a run judged live and
 * the same run judged later from the database cannot disagree.
 */
export function judgeScore(
  clause: DoneWhenClause,
  score: number | null,
  baseline: { id: string; score: number } | null,
): { violation: string | null; baselineRunId: string | null; delta: number | null } {
  const threshold = clause.threshold
  if (!threshold) return { violation: null, baselineRunId: null, delta: null }

  if (score === null) {
    return {
      violation: `${clause.check} has a threshold but produced no score`,
      baselineRunId: null,
      delta: null,
    }
  }

  if (threshold.minScore !== undefined && score < threshold.minScore) {
    return {
      violation: `${clause.check} scored ${score}, below the required ${threshold.minScore}`,
      baselineRunId: null,
      delta: null,
    }
  }
  if (threshold.maxScore !== undefined && score > threshold.maxScore) {
    return {
      violation: `${clause.check} scored ${score}, above the permitted ${threshold.maxScore}`,
      baselineRunId: null,
      delta: null,
    }
  }

  if (threshold.noRegressionVs === 'baseline' && baseline) {
    const delta = score - baseline.score
    return {
      violation:
        delta < 0
          ? `${clause.check} regressed against baseline ${baseline.id}: ${score} vs ${baseline.score}`
          : null,
      baselineRunId: baseline.id,
      delta,
    }
  }

  return { violation: null, baselineRunId: null, delta: null }
}

/**
 * The verdict a change has already earned: for each `done_when` clause, the
 * most recent run of that check, with those parameters, on this change. Nothing
 * is executed. This is what finishing is judged on — re-running at finish time
 * would record unpinned duplicates and cite them instead of the runs that were
 * made against a known commit.
 *
 * With `atCommit`, a run recorded at any other commit is stale: it proves
 * something about a different tree.
 */
export async function latestVerdict(
  db: Db,
  changeId: string,
  opts: { atCommit?: string | null } = {},
): Promise<CheckReport> {
  const [change] = await db.select().from(changes).where(eq(changes.id, changeId)).limit(1)
  if (!change) throw notFound('change', changeId)
  const [workOrder] = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, change.workOrderId))
    .limit(1)
  if (!workOrder) throw notFound('work order', change.workOrderId)

  if (workOrder.doneWhen.length === 0) {
    return {
      changeId,
      workOrderKey: workOrder.key,
      passed: false,
      results: [],
      problem: `work order ${workOrder.key} has an empty done_when: there is nothing to check`,
    }
  }

  const missing = (check: string, why: string): CheckClauseResult => ({
    check,
    result: 'error',
    runId: null,
    score: null,
    citable: false,
    failureSummary: why,
    thresholdViolation: null,
  })

  const results: CheckClauseResult[] = []
  for (const clause of workOrder.doneWhen) {
    const check = await findCheck(db, change.repoId, clause.check)
    if (!check) {
      results.push(missing(clause.check, `check ${clause.check} is not registered for this repo`))
      continue
    }

    const paramsHash = hashParams({ ...check.defaultParams, ...(clause.params ?? {}) })
    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.changeId, change.id), eq(runs.checkId, check.id), eq(runs.paramsHash, paramsHash)))
      .orderBy(desc(runs.startedAt), desc(runs.id))
      .limit(1)

    if (!run) {
      results.push(missing(clause.check, `${clause.check} has never run on this change: run neon_check first`))
      continue
    }
    if (opts.atCommit && run.configCommit !== opts.atCommit) {
      results.push(
        missing(
          clause.check,
          `${clause.check} last ran at ${run.configCommit?.slice(0, 7) ?? 'no recorded commit'}, not at ${opts.atCommit.slice(0, 7)}: run neon_check again`,
        ),
      )
      continue
    }

    const baseline =
      run.baselineRunId && run.score !== null && run.delta !== null
        ? { id: run.baselineRunId, score: run.score - run.delta }
        : null
    const { violation } = judgeScore(clause, run.score, baseline)

    results.push({
      check: clause.check,
      result: run.result,
      runId: run.id,
      score: run.score,
      citable: run.citable,
      failureSummary: run.result === 'pass' ? null : run.failureSummary,
      thresholdViolation: violation,
    })
  }

  return {
    changeId,
    workOrderKey: workOrder.key,
    passed: results.every((r) => r.result === 'pass' && r.thresholdViolation === null),
    results,
  }
}

/**
 * Recording a run that happened somewhere else — CI, a shared runner, a
 * scheduled job. The result is reported; citability is still derived here, so a
 * caller cannot promote its own run to evidence by claiming it.
 */
export interface RecordRunInput {
  checkName: string
  repoId: string | null
  changeId?: string | null
  workOrderId?: string | null
  result: 'pass' | 'fail' | 'error'
  score?: number | null
  params?: Params
  pins?: RunPins
  artifacts?: RunArtifact[]
  trigger?: RunTrigger
  failureSummary?: string | null
  evaluatorModel?: string | null
  startedAt?: Date
  endedAt?: Date
  id?: string
}

export async function recordRun(ctx: Ctx, input: RecordRunInput): Promise<RunRow> {
  const check = await resolveCheck(ctx.db, input.repoId, input.checkName)
  const params = { ...check.defaultParams, ...(input.params ?? {}) }
  const paramsHash = hashParams(params)
  const pins = input.pins ?? {}

  const row: typeof runs.$inferInsert = {
    id: input.id ?? newId(),
    checkId: check.id,
    changeId: input.changeId ?? null,
    workOrderId: input.workOrderId ?? null,
    startedAt: input.startedAt ?? new Date(),
    endedAt: input.endedAt ?? new Date(),
    artifactVersion: pins.artifactVersion ?? null,
    configCommit: pins.configCommit ?? null,
    fixtureVersion: pins.fixtureVersion ?? null,
    paramsResolved: params,
    paramsHash,
    result: input.result,
    score: input.score ?? null,
    artifacts: input.artifacts ?? [],
    trigger: input.trigger ?? 'ci',
    triggeredBy: ctx.actorId,
    citable: deriveCitable({
      checkKind: check.kind,
      requiresFixture: check.requiresFixture,
      artifactVersion: pins.artifactVersion,
      configCommit: pins.configCommit,
      fixtureVersion: pins.fixtureVersion,
      paramsHash,
    }),
    failureSummary: input.failureSummary ?? null,
    evaluatorModel: input.evaluatorModel ?? null,
  }

  return ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(runs).values(row).returning()
    await recordEvent(tx, {
      kind: 'run.recorded',
      subjectType: 'run',
      subjectId: row.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { check: check.name, result: input.result, trigger: row.trigger },
      idempotencyKey: `run.recorded:${row.id}`,
    })
    return created!
  })
}

export async function getRun(db: Db, id: string): Promise<RunRow> {
  const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1)
  if (!row) throw notFound('run', id)
  return row
}

export async function listRuns(
  db: Db,
  opts: { changeId?: string; checkId?: string; limit?: number } = {},
): Promise<RunRow[]> {
  const q = db.select().from(runs).$dynamic()
  const clauses = []
  if (opts.changeId) clauses.push(eq(runs.changeId, opts.changeId))
  if (opts.checkId) clauses.push(eq(runs.checkId, opts.checkId))
  if (clauses.length) q.where(sql.join(clauses, sql` AND `))
  return q.orderBy(desc(runs.startedAt)).limit(opts.limit ?? 50)
}

export async function checksForRepo(db: Db, repoId: string | null) {
  return db
    .select()
    .from(checks)
    .where(repoId ? sql`repo_id = ${repoId} OR repo_id IS NULL` : sql`repo_id IS NULL`)
}
