import {
  blockers,
  changesFor,
  componentIdsTouchedBy,
  currentUser,
  data,
  doneWhenProgress,
  getComponent,
  getRepo,
  getRun,
  getUser,
  runsFor,
} from '../fixtures'
import type { Change, Run, WorkOrder, WorkOrderState } from '../fixtures'

/**
 * Everything the board needs about one work order, computed once. The three
 * visual directions render this differently but must not disagree about it.
 */
export interface BoardRow {
  wo: WorkOrder
  progress: ReturnType<typeof doneWhenProgress>
  changes: Change[]
  repoNames: string[]
  componentNames: string[]
  assignee?: ReturnType<typeof getUser>
  lastRun?: Run
  /** Failing or errored checks on the current completion definition. */
  failingCount: number
  blockedByKeys: string[]
  /** True when this is the run a human should look at first. */
  needsAttention: boolean
  openPrs: number
}

export const STATE_ORDER: WorkOrderState[] = [
  'in_progress',
  'review',
  'ready',
  'blocked',
  'draft',
  'done',
  'abandoned',
]

export const STATE_LABEL: Record<WorkOrderState, string> = {
  draft: 'Draft',
  ready: 'Ready',
  in_progress: 'In progress',
  review: 'In review',
  done: 'Done',
  blocked: 'Blocked',
  abandoned: 'Abandoned',
}

export function buildRow(wo: WorkOrder): BoardRow {
  const progress = doneWhenProgress(wo)
  const changes = changesFor(wo.id)
  const runs = runsFor(wo.id)
  const failingCount = progress.failing
  return {
    wo,
    progress,
    changes,
    repoNames: Array.from(new Set(changes.map((c) => getRepo(c.repoId)?.name ?? c.repoId))),
    componentNames: componentIdsTouchedBy(wo)
      .map((id) => getComponent(id)?.name)
      .filter((x): x is string => Boolean(x)),
    assignee: getUser(wo.assignedTo),
    lastRun: runs[0],
    failingCount,
    blockedByKeys: blockers(wo).map((b) => b.key),
    needsAttention: failingCount > 0 || wo.state === 'blocked',
    openPrs: changes.filter((c) => c.state === 'open' || c.state === 'in_review').length,
  }
}

export const rows: BoardRow[] = data.workOrders.map(buildRow)

export function rowsByState(state: WorkOrderState): BoardRow[] {
  return rows
    .filter((r) => r.wo.state === state)
    .sort((a, b) => Date.parse(b.wo.updatedAt) - Date.parse(a.wo.updatedAt))
}

export const mine = rows.filter((r) => r.wo.assignedTo === currentUser.id)

/** The three-second answer: what is ready, unassigned, and small enough to start. */
export const pickUpNext = rowsByState('ready')
  .filter((r) => !r.wo.assignedTo)
  .sort((a, b) => a.progress.total - b.progress.total)

export const attention = rows
  .filter((r) => r.needsAttention && r.wo.state !== 'done' && r.wo.state !== 'abandoned')
  .sort((a, b) => b.failingCount - a.failingCount)

/** The run the board should feature: the most recent failing scored run. */
export const featuredRun: Run =
  data.runs.find((r) => r.result === 'fail' && r.score !== undefined) ?? data.runs[0]!

export const featuredBaseline = featuredRun.baselineRunId ? getRun(featuredRun.baselineRunId) : undefined

/**
 * The bar this run had to clear. It lives on the work order's `done_when`,
 * not on the check — the same check has different bars for different work.
 */
export const featuredThreshold: number | undefined = data.workOrders
  .find((w) => w.id === featuredRun.workOrderId)
  ?.doneWhen.find((d) => d.checkId === featuredRun.checkId)?.threshold?.minScore

export const summary = {
  ready: rowsByState('ready').length,
  inProgress: rowsByState('in_progress').length,
  review: rowsByState('review').length,
  blocked: rowsByState('blocked').length,
  failingChecks: rows.reduce((n, r) => n + r.failingCount, 0),
  openChanges: data.changes.filter((c) => c.state === 'open' || c.state === 'in_review').length,
  runs24h: data.runs.filter((r) => Date.parse(data.now) - Date.parse(r.startedAt) < 86_400_000).length,
  envsClaimed: data.environments.filter((e) => e.state === 'in_use' || e.state === 'provisioning').length,
}
