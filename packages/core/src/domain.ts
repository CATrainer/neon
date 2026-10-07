/**
 * Neon's core schema.
 *
 * Nothing here may be specific to one kind of engineering team. If a field only
 * makes sense for one domain it belongs in an adapter's opaque config, not in
 * this file.
 *
 * Zod schemas are the source of truth; the TypeScript types are inferred from
 * them so the API, the CLI and the UI cannot drift from each other.
 */

import { z } from 'zod'

/** ISO 8601. Kept as a string end to end — the database is the only place that
 *  needs a real timestamp type, and JSON has no date. */
export const isoDateTime = z.string()
export type ISODateTime = z.infer<typeof isoDateTime>

/** ULID. Client-generatable so a record created offline keeps its identity. */
export const id = z.string().min(1)

// ---------------------------------------------------------------------------
// Repos, components, contracts
// ---------------------------------------------------------------------------

export const repoKind = z.enum(['code', 'knowledge', 'config'])
export type RepoKind = z.infer<typeof repoKind>

export const repo = z.object({
  id,
  name: z.string(),
  remoteUrl: z.string(),
  kind: repoKind,
  /** Opaque to the core: how sensitive this repo is, interpreted by policy. */
  accessClass: z.string().default('internal'),
  defaultBranch: z.string().default('main'),
  registeredAt: isoDateTime,
})
export type Repo = z.infer<typeof repo>

export const component = z.object({
  id,
  repoId: id,
  name: z.string(),
  pathGlobs: z.array(z.string()),
  description: z.string(),
})
export type Component = z.infer<typeof component>

export const interfaceContract = z.object({
  id,
  name: z.string(),
  version: z.string(),
  publisherComponentId: id,
  consumerComponentIds: z.array(id),
  /** Reference into git — never the contract text itself. */
  artifactRef: z.string(),
})
export type InterfaceContract = z.infer<typeof interfaceContract>

// ---------------------------------------------------------------------------
// The maturity ladder: Idea → Work Order (draft) → Work Order (ready)
// ---------------------------------------------------------------------------

export const ideaSource = z.enum(['chat', 'session', 'scheduled', 'manual'])
export type IdeaSource = z.infer<typeof ideaSource>

export const ideaState = z.enum(['open', 'promoted', 'expired', 'discarded'])
export type IdeaState = z.infer<typeof ideaState>

export const idea = z.object({
  id,
  title: z.string(),
  body: z.string(),
  source: ideaSource,
  capturedBy: id,
  capturedAt: isoDateTime,
  state: ideaState,
  /** Silent expiry. A funnel where every entry must be resolved is one people
   *  stop using. */
  expiresAt: isoDateTime,
  tags: z.array(z.string()),
  relatedIds: z.array(id),
  promotedToWorkOrderId: id.nullable(),
})
export type Idea = z.infer<typeof idea>

export const workOrderKind = z.enum(['code', 'inquiry'])
export type WorkOrderKind = z.infer<typeof workOrderKind>

export const workOrderState = z.enum([
  'draft',
  'ready',
  'in_progress',
  'review',
  'done',
  'blocked',
  'abandoned',
])
export type WorkOrderState = z.infer<typeof workOrderState>

/** One clause of a machine-executable completion definition. `check` is a check
 *  *name*, resolved against the repo's registered checks at execution time —
 *  work orders outlive check ids. */
export const doneWhenClause = z.object({
  check: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  threshold: z
    .object({
      minScore: z.number().optional(),
      maxScore: z.number().optional(),
      noRegressionVs: z.literal('baseline').optional(),
    })
    .optional(),
})
export type DoneWhenClause = z.infer<typeof doneWhenClause>

export const workOrder = z.object({
  id,
  key: z.string(),
  kind: workOrderKind,
  title: z.string(),
  intent: z.string(),
  state: workOrderState,
  acceptanceCriteria: z.array(z.string()),
  doneWhen: z.array(doneWhenClause),
  /** A hint for context assembly only. Components actually touched are derived
   *  from the diff — never treat this list as fact. */
  declaredComponentIds: z.array(id),
  createdBy: id,
  blockedBy: z.array(id),
  supersedes: id.nullable(),
  originIdeaId: id.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type WorkOrder = z.infer<typeof workOrder>

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

/** Only `claimed` and `abandoned` are Neon's to know. Everything else is
 *  derived from git and PR state, and is stored as a cache at most. */
export const changeState = z.enum([
  'claimed',
  'open',
  'in_review',
  'merged',
  'closed',
  'abandoned',
])
export type ChangeState = z.infer<typeof changeState>

export const change = z.object({
  id,
  workOrderId: id,
  repoId: id,
  branch: z.string(),
  prUrl: z.string().nullable(),
  /** Path to the spec or record in git. Never the content. */
  specRef: z.string().nullable(),
  specContentHash: z.string().nullable(),
  dependsOn: z.array(id),
  state: changeState,
  claimedBy: id.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type Change = z.infer<typeof change>

// ---------------------------------------------------------------------------
// Checks and runs
// ---------------------------------------------------------------------------

/** Adapter kinds. Adding one must never require a schema change — checks are
 *  registered declaratively from a repo's neon.checks.yaml. */
export const checkKind = z.enum(['noop', 'command', 'schema', 'prompt'])
export type CheckKind = z.infer<typeof checkKind>

export const check = z.object({
  id,
  /** null = global, available in every repo. */
  repoId: id.nullable(),
  name: z.string(),
  kind: checkKind,
  /** Opaque to the core; the adapter interprets it. */
  runnerRef: z.string(),
  requiresEnvironment: z.boolean(),
  requiresFixture: z.boolean(),
  description: z.string(),
  defaultParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** JSON Schema the adapter's result must satisfy, or null for pass/fail. */
  resultSchema: z.unknown().nullable(),
})
export type Check = z.infer<typeof check>

export const runResult = z.enum(['pass', 'fail', 'error'])
export type RunResult = z.infer<typeof runResult>

export const runTrigger = z.enum(['local', 'ci', 'scheduled'])
export type RunTrigger = z.infer<typeof runTrigger>

export const runArtifact = z.object({
  id,
  name: z.string(),
  kind: z.string(),
  sizeBytes: z.number(),
  /** Short inline preview so a failure can be diagnosed without a fetch. */
  preview: z.string().nullable(),
})
export type RunArtifact = z.infer<typeof runArtifact>

export const run = z.object({
  id,
  checkId: id,
  changeId: id.nullable(),
  workOrderId: id.nullable(),
  environmentId: id.nullable(),
  startedAt: isoDateTime,
  endedAt: isoDateTime.nullable(),
  artifactVersion: z.string().nullable(),
  configCommit: z.string().nullable(),
  fixtureVersion: z.string().nullable(),
  paramsResolved: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  paramsHash: z.string().nullable(),
  result: runResult,
  score: z.number().nullable(),
  baselineRunId: id.nullable(),
  delta: z.number().nullable(),
  artifacts: z.array(runArtifact),
  trigger: runTrigger,
  triggeredBy: id.nullable(),
  /** Derived, never supplied by a caller. See `deriveCitable`. */
  citable: z.boolean(),
  /** Present on fail/error. One line: the thing you actually need. */
  failureSummary: z.string().nullable(),
  /** `prompt` runs record the model and version so a result stays interpretable
   *  when the model changes underneath it. */
  evaluatorModel: z.string().nullable(),
})
export type Run = z.infer<typeof run>

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export const decisionState = z.enum(['proposed', 'accepted', 'contested', 'superseded'])
export type DecisionState = z.infer<typeof decisionState>

export const rejectedAlternative = z.object({
  title: z.string(),
  /** Why it was rejected. This is the field the whole generative side of the
   *  system reads: a blocking constraint that may since have expired. */
  why: z.string(),
})
export type RejectedAlternative = z.infer<typeof rejectedAlternative>

export const decisionPosition = z.object({
  holder: z.string(),
  summary: z.string(),
})
export type DecisionPosition = z.infer<typeof decisionPosition>

export const decision = z.object({
  id,
  key: z.string(),
  title: z.string(),
  rationale: z.string(),
  rejectedAlternatives: z.array(rejectedAlternative),
  componentIds: z.array(id),
  /** Only citable runs may appear here. Enforced in the domain service. */
  evidenceRunIds: z.array(id),
  state: decisionState,
  supersededBy: id.nullable(),
  supersedes: id.nullable(),
  /** Contested decisions: what evidence would settle the argument. */
  settlingCondition: z.string().nullable(),
  positions: z.array(decisionPosition),
  authorId: id,
  decidedAt: isoDateTime,
  workOrderIds: z.array(id),
  /** Reference into git for the full record. Neon holds the hash, not the text. */
  recordRef: z.string().nullable(),
  recordContentHash: z.string().nullable(),
})
export type Decision = z.infer<typeof decision>

// ---------------------------------------------------------------------------
// Lab (schema only in this phase — nothing provisions yet)
// ---------------------------------------------------------------------------

export const environmentState = z.enum([
  'provisioning',
  'ready',
  'in_use',
  'reaping',
  'destroyed',
])
export type EnvironmentState = z.infer<typeof environmentState>

export const environment = z.object({
  id,
  name: z.string(),
  targetId: id,
  topology: z.string(),
  claimedBy: id.nullable(),
  claimedAt: isoDateTime.nullable(),
  ttlSeconds: z.number(),
  expiresAt: isoDateTime.nullable(),
  state: environmentState,
  artifactVersion: z.string().nullable(),
  configCommit: z.string().nullable(),
  workOrderId: id.nullable(),
})
export type Environment = z.infer<typeof environment>

export const target = z.object({
  id,
  name: z.string(),
  /** Adapter key. The core does not know what kinds exist. */
  kind: z.string(),
  config: z.record(z.string(), z.unknown()),
  credentialsRef: z.string().nullable(),
})
export type Target = z.infer<typeof target>

// ---------------------------------------------------------------------------
// People and questions
// ---------------------------------------------------------------------------

export const user = z.object({
  id,
  name: z.string(),
  email: z.string(),
  githubLogin: z.string().nullable(),
  avatarUrl: z.string().nullable(),
})
export type User = z.infer<typeof user>

export const openQuestion = z.object({
  id,
  componentId: id,
  question: z.string(),
  raisedBy: id,
  raisedAt: isoDateTime,
  workOrderId: id.nullable(),
  answeredAt: isoDateTime.nullable(),
})
export type OpenQuestion = z.infer<typeof openQuestion>
