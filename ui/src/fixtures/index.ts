import { checks, components, contracts, openQuestions, repos, targets, users } from './core'
import { decisions } from './decisions'
import { environments, runs } from './evidence'
import { NOW } from './time'
import { changes, workOrders } from './work'
import type {
  Change,
  Check,
  Component,
  Dataset,
  Decision,
  DoneWhen,
  Environment,
  Repo,
  Run,
  RunResult,
  User,
  WorkOrder,
} from './types'

export * from './types'

/**
 * The single fixture surface. Screens import from here and nowhere else, so
 * swapping in a real API client is a change to this file only.
 */
export const data: Dataset = {
  now: NOW,
  users,
  repos,
  targets,
  components,
  contracts,
  checks,
  workOrders,
  changes,
  runs,
  decisions,
  environments,
  openQuestions,
}

// ── Lookups ──────────────────────────────────────────────────────────────

const index = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))

const userById = index(users)
const repoById = index(repos)
const componentById = index(components)
const checkById = index(checks)
const runById = index(runs)
const workOrderById = index(workOrders)
const changeById = index(changes)
const decisionById = index(decisions)
const envById = index(environments)

export const getUser = (id?: string): User | undefined => (id ? userById.get(id) : undefined)
export const getRepo = (id: string): Repo | undefined => repoById.get(id)
export const getComponent = (id: string): Component | undefined => componentById.get(id)
export const getCheck = (id: string): Check | undefined => checkById.get(id)
export const getRun = (id: string): Run | undefined => runById.get(id)
export const getWorkOrder = (id: string): WorkOrder | undefined => workOrderById.get(id)
export const getChange = (id: string): Change | undefined => changeById.get(id)
export const getDecision = (id: string): Decision | undefined => decisionById.get(id)
export const getEnvironment = (id?: string): Environment | undefined =>
  id ? envById.get(id) : undefined

export const workOrderByKey = (key: string): WorkOrder | undefined =>
  workOrders.find((w) => w.key.toLowerCase() === key.toLowerCase())

export const decisionByKey = (key: string): Decision | undefined =>
  decisions.find((d) => d.key.toLowerCase() === key.toLowerCase())

// ── Derived views ────────────────────────────────────────────────────────

export const changesFor = (workOrderId: string): Change[] =>
  changes.filter((c) => c.workOrderId === workOrderId)

export const runsFor = (workOrderId: string): Run[] =>
  runs.filter((r) => r.workOrderId === workOrderId)

export const runsForChange = (changeId: string): Run[] =>
  runs.filter((r) => r.changeId === changeId)

export const decisionsForWorkOrder = (workOrderId: string): Decision[] =>
  decisions.filter((d) => d.workOrderIds.includes(workOrderId))

/** Decisions that constrain any component this work order declares or touches. */
export const constrainingDecisions = (wo: WorkOrder): Decision[] => {
  const touched = new Set(componentIdsTouchedBy(wo))
  return decisions.filter(
    (d) => d.state !== 'superseded' && d.componentIds.some((c) => touched.has(c)),
  )
}

/**
 * Declared components are a hint. The components actually touched are derived
 * from the changes' repos — the closest thing the fixture has to a diff.
 */
export const componentIdsTouchedBy = (wo: WorkOrder): string[] => {
  const repoIds = new Set(changesFor(wo.id).map((c) => c.repoId))
  const derived = components
    .filter((c) => repoIds.has(c.repoId) && wo.declaredComponentIds.includes(c.id))
    .map((c) => c.id)
  return Array.from(new Set([...wo.declaredComponentIds, ...derived]))
}

export const contractsFor = (componentId: string) =>
  contracts.filter(
    (c) => c.publisherComponentId === componentId || c.consumerComponentIds.includes(componentId),
  )

export const workOrdersForComponent = (componentId: string): WorkOrder[] =>
  workOrders.filter((w) => componentIdsTouchedBy(w).includes(componentId))

export const decisionsForComponent = (componentId: string): Decision[] =>
  decisions.filter((d) => d.componentIds.includes(componentId))

export const openQuestionsForComponent = (componentId: string) =>
  openQuestions.filter((q) => q.componentId === componentId)

export const environmentsForWorkOrder = (workOrderId: string): Environment[] =>
  environments.filter((e) => e.workOrderId === workOrderId)

/** The latest run of a given check for a work order, across all its changes. */
export const latestRunOfCheck = (workOrderId: string, checkId: string): Run | undefined =>
  runs.find((r) => r.workOrderId === workOrderId && r.checkId === checkId)

export type DoneWhenStatus = {
  entry: DoneWhen
  check: Check
  run?: Run
  /** `pending` = never run. `stale` = ran against an older artifact than the newest run on this work order. */
  status: RunResult | 'pending' | 'stale'
  meetsThreshold: boolean
  thresholdNote?: string
}

export const doneWhenStatus = (wo: WorkOrder): DoneWhenStatus[] =>
  wo.doneWhen.map((entry) => {
    const check = checkById.get(entry.checkId)!
    const run = latestRunOfCheck(wo.id, entry.checkId)
    if (!run) {
      return { entry, check, status: 'pending' as const, meetsThreshold: false }
    }
    let meetsThreshold = run.result === 'pass'
    let thresholdNote: string | undefined
    if (entry.threshold?.minScore !== undefined) {
      const score = run.score ?? 0
      const ok = score >= entry.threshold.minScore
      meetsThreshold = meetsThreshold && ok
      thresholdNote = `${score.toFixed(3)} / ${entry.threshold.minScore.toFixed(2)} min`
    }
    if (entry.threshold?.noRegressionVs === 'baseline' && run.delta !== undefined) {
      const ok = run.delta >= 0
      meetsThreshold = meetsThreshold && ok
      thresholdNote = `${thresholdNote ?? ''}${thresholdNote ? ' · ' : ''}${
        run.delta >= 0 ? '+' : ''
      }${run.delta.toFixed(3)} vs baseline`
    }
    return { entry, check, run, status: run.result, meetsThreshold, thresholdNote }
  })

/** How far through its completion definition a work order is. */
export const doneWhenProgress = (wo: WorkOrder) => {
  const rows = doneWhenStatus(wo)
  const passing = rows.filter((r) => r.status === 'pass' && r.meetsThreshold).length
  const failing = rows.filter((r) => r.status === 'fail' || r.status === 'error').length
  const pending = rows.filter((r) => r.status === 'pending').length
  return { total: rows.length, passing, failing, pending, rows }
}

export const blockers = (wo: WorkOrder): WorkOrder[] =>
  wo.blockedBy.map((id) => workOrderById.get(id)).filter((x): x is WorkOrder => Boolean(x))

export const blocking = (wo: WorkOrder): WorkOrder[] =>
  workOrders.filter((w) => w.blockedBy.includes(wo.id))

export const evidenceRuns = (d: Decision): Run[] =>
  d.evidenceRunIds.map((id) => runById.get(id)).filter((x): x is Run => Boolean(x))

/** Milliseconds until an environment's TTL expires. Negative means overdue. */
export const msUntilExpiry = (env: Environment): number | undefined =>
  env.expiresAt ? Date.parse(env.expiresAt) - Date.parse(NOW) : undefined

export const durationMs = (r: Run): number => Date.parse(r.endedAt) - Date.parse(r.startedAt)

export const currentUser: User = users[0]!
