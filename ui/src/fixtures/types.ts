/**
 * Neon domain types.
 *
 * These mirror the core schema. They are deliberately free of anything
 * specific to the fictional team in `data.ts` — swapping the fixture module
 * for a real API client should not require touching a component.
 */

export type ISODateTime = string

export type RepoKind = 'code' | 'knowledge' | 'config'

export interface Repo {
  id: string
  name: string
  remoteUrl: string
  kind: RepoKind
  defaultBranch: string
  registeredAt: ISODateTime
}

export interface Component {
  id: string
  repoId: string
  name: string
  pathGlobs: string[]
  description: string
}

export interface InterfaceContract {
  id: string
  name: string
  version: string
  publisherComponentId: string
  consumerComponentIds: string[]
  artifactRef: string
}

export type WorkOrderState =
  | 'draft'
  | 'ready'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'blocked'
  | 'abandoned'

/** One entry of a work order's machine-executable completion definition. */
export interface DoneWhen {
  checkId: string
  params?: Record<string, string | number | boolean>
  threshold?: {
    minScore?: number
    maxScore?: number
    noRegressionVs?: 'baseline'
  }
}

export interface WorkOrder {
  id: string
  key: string
  title: string
  /** Why we are doing this. Prose, written by a human. */
  intent: string
  state: WorkOrderState
  acceptanceCriteria: string[]
  doneWhen: DoneWhen[]
  /** Hint for context assembly only — never treated as fact. */
  declaredComponentIds: string[]
  createdBy: string
  assignedTo?: string
  blockedBy: string[]
  supersedes?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  /** Free-form label used for board grouping. Not part of the core schema. */
  priority: 'now' | 'next' | 'later'
}

export type ChangeState =
  | 'claimed'
  | 'open'
  | 'in_review'
  | 'merged'
  | 'closed'
  | 'abandoned'

export interface Commit {
  sha: string
  message: string
  author: string
  at: ISODateTime
}

export interface Change {
  id: string
  workOrderId: string
  repoId: string
  branch: string
  prNumber?: number
  prUrl?: string
  prTitle?: string
  specRef?: string
  specContentHash?: string
  /** Other change ids this one must land behind. */
  dependsOn: string[]
  state: ChangeState
  claimedBy?: string
  commits: Commit[]
}

export type CheckKind = 'command' | 'eval' | 'policy' | 'contract' | 'noop'

export interface Check {
  id: string
  /** null = global, available in every repo. */
  repoId: string | null
  name: string
  kind: CheckKind
  runnerRef: string
  requiresEnvironment: boolean
  requiresFixture: boolean
  scored: boolean
  description: string
  defaultParams?: Record<string, string | number | boolean>
}

export type RunResult = 'pass' | 'fail' | 'error'
export type RunTrigger = 'local' | 'ci' | 'scheduled'

export interface RunArtifact {
  id: string
  name: string
  kind: 'log' | 'plan' | 'report' | 'diff' | 'trace' | 'coverage'
  sizeBytes: number
  /** Short inline preview so the evidence view can diagnose without a fetch. */
  preview?: string
}

export interface Run {
  id: string
  checkId: string
  changeId?: string
  workOrderId?: string
  environmentId?: string
  startedAt: ISODateTime
  endedAt: ISODateTime
  /** Released artifact under test. Absent for uncitable runs. */
  artifactVersion?: string
  configCommit?: string
  fixtureVersion?: string
  paramsResolved: Record<string, string | number | boolean>
  paramsHash?: string
  result: RunResult
  score?: number
  baselineRunId?: string
  delta?: number
  artifacts: RunArtifact[]
  trigger: RunTrigger
  triggeredBy?: string
  /** Derived: pinned enough to be cited as evidence on a decision. */
  citable: boolean
  /** Present on fail/error. One line, the thing you actually need. */
  failureSummary?: string
}

export type DecisionState = 'proposed' | 'accepted' | 'contested' | 'superseded'

export interface DecisionPosition {
  holder: string
  summary: string
}

export interface Decision {
  id: string
  key: string
  title: string
  rationale: string
  rejectedAlternatives: { title: string; why: string }[]
  componentIds: string[]
  evidenceRunIds: string[]
  state: DecisionState
  supersededBy?: string
  supersedes?: string
  /** Contested decisions only: what would settle the argument. */
  settlingCondition?: string
  positions?: DecisionPosition[]
  authorId: string
  decidedAt: ISODateTime
  workOrderIds: string[]
}

export type EnvironmentState =
  | 'provisioning'
  | 'ready'
  | 'in_use'
  | 'reaping'
  | 'destroyed'

export interface Environment {
  id: string
  name: string
  targetId: string
  topology: string
  claimedBy?: string
  claimedAt?: ISODateTime
  /** Seconds from claim. */
  ttlSeconds: number
  expiresAt?: ISODateTime
  state: EnvironmentState
  artifactVersion?: string
  configCommit?: string
  workOrderId?: string
}

export interface Target {
  id: string
  name: string
  kind: 'docker-local' | 'aws-sandbox' | 'aws-staging'
  region?: string
}

export interface User {
  id: string
  name: string
  email: string
  githubLogin: string
  /** Short label used where the full name will not fit. */
  short: string
  accent: string
}

export interface OpenQuestion {
  id: string
  componentId: string
  question: string
  raisedBy: string
  raisedAt: ISODateTime
  workOrderId?: string
}

export interface Dataset {
  now: ISODateTime
  users: User[]
  repos: Repo[]
  targets: Target[]
  components: Component[]
  contracts: InterfaceContract[]
  checks: Check[]
  workOrders: WorkOrder[]
  changes: Change[]
  runs: Run[]
  decisions: Decision[]
  environments: Environment[]
  openQuestions: OpenQuestion[]
}
