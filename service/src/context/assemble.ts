import { estimateTokens, newId, type DoneWhenClause } from '@neon/core'
import { and, arrayOverlaps, desc, eq, inArray, isNull, ne, notInArray, or } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import {
  components,
  contextPacks,
  decisions,
  generatedRules,
  interfaceContracts,
  openQuestions,
  repos,
  workOrders,
} from '../db/schema.js'
import { firstSentence } from '../domain/search.js'
import { getWorkOrderByKey } from '../domain/workOrders.js'

/**
 * Context assembly.
 *
 * This is the part that decides whether Neon is useful or noise, so it is a
 * subsystem rather than a query. Three rules do most of the work:
 *
 *   - every item states why it is here; if we cannot state the reason, it does
 *     not go in;
 *   - references and summaries, never full bodies — the agent fetches detail on
 *     demand, and front-loading everything makes it worse;
 *   - the token budget is hard, and exceeding it means saying what was dropped
 *     rather than silently truncating.
 *
 * Constraints already carried by a path-scoped rule are left out on purpose:
 * those load themselves when the agent touches the files they govern, and
 * repeating them here would spend budget to dilute what is left.
 */

export type PackItemKind =
  | 'decision'
  | 'contract'
  | 'related_work_order'
  | 'open_question'
  | 'component'

export interface PackItem {
  kind: PackItemKind
  ref: string
  title: string
  summary: string
  /** Why this is in the pack. Not decorative — an item without a stated reason
   *  is an item nobody can evaluate. */
  reason: string
  score: number
  tokens: number
}

export interface OmittedItem {
  kind: PackItemKind
  ref: string
  title: string
  reason: string
}

export interface ContextPack {
  workOrder: {
    key: string
    kind: 'code' | 'inquiry'
    title: string
    intent: string
    state: string
    acceptanceCriteria: string[]
  }
  /** Human-readable rendering of the executable definition of done. */
  doneWhen: string[]
  scope: { componentRefs: string[]; declared: boolean }
  items: PackItem[]
  omitted: OmittedItem[]
  budget: { tokens: number; used: number }
  notes: string[]
  packId: string
}

const WEIGHTS: Record<PackItemKind, number> = {
  decision: 1,
  contract: 0.85,
  open_question: 0.6,
  related_work_order: 0.5,
  component: 0.4,
}

export interface AssembleOptions {
  budgetTokens?: number
  requestedBy?: string | null
  /** Set false in tests that assert on assembly without writing a log row. */
  log?: boolean
}

export async function assembleContext(
  db: Db,
  workOrderKey: string,
  options: AssembleOptions = {},
): Promise<ContextPack> {
  const workOrder = await getWorkOrderByKey(db, workOrderKey)
  const budget = options.budgetTokens ?? 6000
  const notes: string[] = []

  const [repo] = workOrder.repoId
    ? await db.select().from(repos).where(eq(repos.id, workOrder.repoId)).limit(1)
    : []

  // Declared components are a hint for assembly only — what was actually
  // touched is derived from the diff, and this list is never treated as fact.
  let scope = workOrder.declaredComponentIds
  let declared = scope.length > 0
  if (!declared && repo) {
    const all = await db.select().from(components).where(eq(components.repoId, repo.id))
    scope = all.map((c) => c.id)
    if (scope.length > 0) {
      notes.push(
        `no components declared on ${workOrder.key}; scoped to all ${scope.length} components in ${repo.name}`,
      )
    }
  }

  const componentRows = scope.length
    ? await db.select().from(components).where(inArray(components.id, scope))
    : []
  const componentName = new Map(componentRows.map((c) => [c.id, c.name]))

  const items: PackItem[] = []

  // -- Decisions constraining the components in scope ------------------------
  // Accepted and contested only. A superseded decision in a pack is worse than
  // no decision: it is a confident answer that is no longer true.
  if (scope.length > 0) {
    const rows = await db
      .select()
      .from(decisions)
      .where(
        and(
          arrayOverlaps(decisions.componentIds, scope),
          inArray(decisions.state, ['accepted', 'contested']),
        ),
      )
      .orderBy(desc(decisions.decidedAt))
      .limit(30)

    const ruledOut = await ruleCoveredDecisions(
      db,
      repo?.id ?? null,
      rows.map((r) => r.id),
    )

    for (const row of rows) {
      const touches = row.componentIds.filter((c) => scope.includes(c))
      const names = touches.map((c) => componentName.get(c) ?? c)

      if (ruledOut.has(row.id)) {
        notes.push(
          `${row.key} is carried by a path-scoped rule on ${names.join(', ')} and is left out of the pack on purpose`,
        )
        continue
      }

      const contested = row.state === 'contested'
      items.push({
        kind: 'decision',
        ref: row.key,
        title: row.title,
        summary: contested
          ? `contested — ${row.positions.map((p) => p.summary).join(' / ')}${
              row.settlingCondition ? ` · settles when: ${row.settlingCondition}` : ''
            }`
          : firstSentence(row.rationale),
        reason: contested
          ? `unsettled, and constrains ${names.join(', ')}`
          : `constrains ${names.join(', ')}`,
        score: WEIGHTS.decision + (contested ? 0.05 : 0) + 0.05 * touches.length,
        tokens: 0,
      })
    }
  }

  // -- Interface contracts published or consumed by those components ---------
  if (scope.length > 0) {
    const rows = await db
      .select()
      .from(interfaceContracts)
      .where(
        or(
          inArray(interfaceContracts.publisherComponentId, scope),
          arrayOverlaps(interfaceContracts.consumerComponentIds, scope),
        ),
      )
      .limit(20)

    for (const row of rows) {
      const publishes = scope.includes(row.publisherComponentId)
      items.push({
        kind: 'contract',
        ref: `${row.name}@${row.version}`,
        title: `${row.name} v${row.version}`,
        summary: `defined in ${row.artifactRef || 'the repo'}`,
        reason: publishes
          ? `published by ${componentName.get(row.publisherComponentId) ?? 'a component in scope'} — breaking it breaks its consumers`
          : `consumed by a component in scope — do not assume you may change it`,
        score: WEIGHTS.contract + (publishes ? 0.05 : 0),
        tokens: 0,
      })
    }
  }

  // -- Recent work on the same components ------------------------------------
  if (scope.length > 0) {
    const rows = await db
      .select()
      .from(workOrders)
      .where(
        and(
          arrayOverlaps(workOrders.declaredComponentIds, scope),
          ne(workOrders.id, workOrder.id),
          notInArray(workOrders.state, ['draft', 'abandoned']),
        ),
      )
      .orderBy(desc(workOrders.updatedAt))
      .limit(5)

    for (const row of rows) {
      items.push({
        kind: 'related_work_order',
        ref: row.key,
        title: row.title,
        summary: `${row.state} · ${firstSentence(row.intent)}`,
        reason: `recent work on ${row.declaredComponentIds
          .filter((c) => scope.includes(c))
          .map((c) => componentName.get(c) ?? c)
          .join(', ')}`,
        score: WEIGHTS.related_work_order,
        tokens: 0,
      })
    }
  }

  // -- Open questions on those components ------------------------------------
  if (scope.length > 0) {
    const rows = await db
      .select()
      .from(openQuestions)
      .where(and(inArray(openQuestions.componentId, scope), isNull(openQuestions.answeredAt)))
      .limit(10)

    for (const row of rows) {
      items.push({
        kind: 'open_question',
        ref: row.id,
        title: row.question,
        summary: '',
        reason: `unanswered on ${componentName.get(row.componentId) ?? 'a component in scope'}`,
        score: WEIGHTS.open_question,
        tokens: 0,
      })
    }
  }

  for (const item of items) {
    item.tokens = estimateTokens(`${item.title} ${item.summary} ${item.reason}`)
  }

  // -- Budget ----------------------------------------------------------------
  // The work order's own intent, criteria and done_when are the pack's spine:
  // they are counted, but never dropped. Dropping them would leave the agent
  // with context about work it can no longer identify.
  const spineTokens = estimateTokens(
    [workOrder.intent, ...workOrder.acceptanceCriteria, ...renderDoneWhen(workOrder.doneWhen)].join(
      ' ',
    ),
  )

  const ranked = [...items].sort((a, b) => b.score - a.score)
  const kept: PackItem[] = []
  const omitted: OmittedItem[] = []
  let used = spineTokens

  for (const item of ranked) {
    if (used + item.tokens <= budget) {
      kept.push(item)
      used += item.tokens
    } else {
      omitted.push({
        kind: item.kind,
        ref: item.ref,
        title: item.title,
        reason: `over the ${budget}-token budget`,
      })
    }
  }

  if (omitted.length > 0) {
    notes.push(
      `${omitted.length} lower-relevance item(s) dropped to stay inside the ${budget}-token budget: ${omitted
        .map((o) => o.ref)
        .join(', ')}`,
    )
  }
  if (spineTokens > budget) {
    notes.push(
      `the work order's own intent and done_when already exceed the ${budget}-token budget; nothing else was added`,
    )
  }

  const packId = newId()
  const pack: ContextPack = {
    workOrder: {
      key: workOrder.key,
      kind: workOrder.kind,
      title: workOrder.title,
      intent: workOrder.intent,
      state: workOrder.state,
      acceptanceCriteria: workOrder.acceptanceCriteria,
    },
    doneWhen: renderDoneWhen(workOrder.doneWhen),
    scope: { componentRefs: componentRows.map((c) => c.name), declared },
    items: kept,
    omitted,
    budget: { tokens: budget, used },
    notes,
    packId,
  }

  if (options.log !== false) {
    // Logged in full, every call. We need this to evaluate retrieval quality
    // later, and it is unrecoverable if not captured from day one.
    await db.insert(contextPacks).values({
      id: packId,
      workOrderId: workOrder.id,
      repoId: workOrder.repoId,
      requestedBy: options.requestedBy ?? null,
      purpose: 'execution',
      assemblerVersion: '1',
      budgetTokens: budget,
      usedTokens: used,
      items: kept,
      omitted,
    })
  }

  return pack
}

/** `done_when` as sentences. The agent needs to know what will be run against
 *  it before it starts, not after a hook refuses to let it stop. */
export function renderDoneWhen(clauses: DoneWhenClause[]): string[] {
  return clauses.map((clause) => {
    const parts = [clause.check]
    if (clause.params && Object.keys(clause.params).length > 0) {
      parts.push(
        `with ${Object.entries(clause.params)
          .map(([k, v]) => `${k}=${String(v)}`)
          .join(', ')}`,
      )
    }
    if (clause.threshold?.minScore !== undefined) {
      parts.push(`scoring at least ${clause.threshold.minScore}`)
    }
    if (clause.threshold?.maxScore !== undefined) {
      parts.push(`scoring at most ${clause.threshold.maxScore}`)
    }
    if (clause.threshold?.noRegressionVs) {
      parts.push(`with no regression against ${clause.threshold.noRegressionVs}`)
    }
    return parts.join(' ')
  })
}

/**
 * Decisions whose constraint is already expressed as a path-scoped rule in this
 * repo. Rules carry the hard, local constraints that apply whenever you touch a
 * file; the pack carries intent, cross-cutting decisions, contracts and
 * history. Duplicating the first in the second wastes budget.
 */
async function ruleCoveredDecisions(
  db: Db,
  repoId: string | null,
  decisionIds: string[],
): Promise<Set<string>> {
  if (!repoId || decisionIds.length === 0) return new Set()
  const rows = await db
    .select({ decisionId: generatedRules.decisionId })
    .from(generatedRules)
    .where(
      and(
        eq(generatedRules.repoId, repoId),
        inArray(generatedRules.decisionId, decisionIds),
        inArray(generatedRules.state, ['proposed', 'applied']),
      ),
    )
  return new Set(rows.map((r) => r.decisionId))
}
