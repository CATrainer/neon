/**
 * Drizzle mapping of the SQL schema in `migrations/`.
 *
 * The migrations are the source of truth — this file exists so queries are
 * type-checked, not so the schema can be generated. Constraints, indexes and
 * triggers live in the SQL where they can be read.
 */
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import type {
  DecisionPosition,
  DoneWhenClause,
  RejectedAlternative,
  RunArtifact,
} from '@neon/core'

type Params = Record<string, string | number | boolean>

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  githubLogin: text('github_login'),
  avatarUrl: text('avatar_url'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const repos = pgTable('repos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  remoteUrl: text('remote_url').notNull(),
  kind: text('kind').$type<'code' | 'knowledge' | 'config'>().notNull(),
  accessClass: text('access_class').notNull().default('internal'),
  defaultBranch: text('default_branch').notNull().default('main'),
  localPath: text('local_path'),
  keyPrefix: text('key_prefix').notNull().default('WO'),
  registeredAt: ts('registered_at').notNull().defaultNow(),
})

export const components = pgTable('components', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  name: text('name').notNull(),
  pathGlobs: text('path_globs').array().notNull().default([]),
  description: text('description').notNull().default(''),
})

export const interfaceContracts = pgTable('interface_contracts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  publisherComponentId: text('publisher_component_id').notNull(),
  consumerComponentIds: text('consumer_component_ids').array().notNull().default([]),
  artifactRef: text('artifact_ref').notNull().default(''),
})

export const ideas = pgTable('ideas', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  source: text('source').$type<'chat' | 'session' | 'scheduled' | 'manual'>().notNull(),
  capturedBy: text('captured_by').notNull(),
  capturedAt: ts('captured_at').notNull().defaultNow(),
  touchedAt: ts('touched_at').notNull().defaultNow(),
  state: text('state').$type<'open' | 'promoted' | 'expired' | 'discarded'>().notNull(),
  expiresAt: ts('expires_at').notNull(),
  tags: text('tags').array().notNull().default([]),
  relatedIds: text('related_ids').array().notNull().default([]),
  promotedToWorkOrderId: text('promoted_to_work_order_id'),
  repoId: text('repo_id'),
  searchText: text('search_text').notNull().default(''),
})

export const workOrders = pgTable('work_orders', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  kind: text('kind').$type<'code' | 'inquiry'>().notNull(),
  title: text('title').notNull(),
  intent: text('intent').notNull().default(''),
  state: text('state')
    .$type<'draft' | 'ready' | 'in_progress' | 'review' | 'done' | 'blocked' | 'abandoned'>()
    .notNull(),
  acceptanceCriteria: jsonb('acceptance_criteria').$type<string[]>().notNull().default([]),
  doneWhen: jsonb('done_when').$type<DoneWhenClause[]>().notNull().default([]),
  declaredComponentIds: text('declared_component_ids').array().notNull().default([]),
  createdBy: text('created_by').notNull(),
  blockedBy: text('blocked_by').array().notNull().default([]),
  supersedes: text('supersedes'),
  originIdeaId: text('origin_idea_id'),
  repoId: text('repo_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const changes = pgTable('changes', {
  id: text('id').primaryKey(),
  workOrderId: text('work_order_id').notNull(),
  repoId: text('repo_id').notNull(),
  branch: text('branch').notNull(),
  prUrl: text('pr_url'),
  specRef: text('spec_ref'),
  specContentHash: text('spec_content_hash'),
  dependsOn: text('depends_on').array().notNull().default([]),
  state: text('state')
    .$type<'claimed' | 'open' | 'in_review' | 'merged' | 'closed' | 'abandoned'>()
    .notNull(),
  claimedBy: text('claimed_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const checks = pgTable('checks', {
  id: text('id').primaryKey(),
  repoId: text('repo_id'),
  name: text('name').notNull(),
  kind: text('kind').$type<'noop' | 'command' | 'schema' | 'prompt'>().notNull(),
  runnerRef: text('runner_ref').notNull().default(''),
  requiresEnvironment: boolean('requires_environment').notNull().default(false),
  requiresFixture: boolean('requires_fixture').notNull().default(false),
  description: text('description').notNull().default(''),
  defaultParams: jsonb('default_params').$type<Params>().notNull().default({}),
  resultSchema: jsonb('result_schema'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  checkId: text('check_id').notNull(),
  changeId: text('change_id'),
  workOrderId: text('work_order_id'),
  environmentId: text('environment_id'),
  startedAt: ts('started_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
  artifactVersion: text('artifact_version'),
  configCommit: text('config_commit'),
  fixtureVersion: text('fixture_version'),
  paramsResolved: jsonb('params_resolved').$type<Params>().notNull().default({}),
  paramsHash: text('params_hash'),
  result: text('result').$type<'pass' | 'fail' | 'error'>().notNull(),
  score: doublePrecision('score'),
  baselineRunId: text('baseline_run_id'),
  delta: doublePrecision('delta'),
  artifacts: jsonb('artifacts').$type<RunArtifact[]>().notNull().default([]),
  trigger: text('trigger').$type<'local' | 'ci' | 'scheduled'>().notNull(),
  triggeredBy: text('triggered_by'),
  citable: boolean('citable').notNull().default(false),
  failureSummary: text('failure_summary'),
  evaluatorModel: text('evaluator_model'),
})

export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull().default(''),
  rejectedAlternatives: jsonb('rejected_alternatives')
    .$type<RejectedAlternative[]>()
    .notNull()
    .default([]),
  componentIds: text('component_ids').array().notNull().default([]),
  state: text('state')
    .$type<'proposed' | 'accepted' | 'contested' | 'superseded'>()
    .notNull(),
  supersededBy: text('superseded_by'),
  supersedes: text('supersedes'),
  settlingCondition: text('settling_condition'),
  positions: jsonb('positions').$type<DecisionPosition[]>().notNull().default([]),
  authorId: text('author_id').notNull(),
  decidedAt: ts('decided_at').notNull().defaultNow(),
  workOrderIds: text('work_order_ids').array().notNull().default([]),
  recordRef: text('record_ref'),
  recordContentHash: text('record_content_hash'),
  searchText: text('search_text').notNull().default(''),
})

export const decisionEvidence = pgTable('decision_evidence', {
  decisionId: text('decision_id').notNull(),
  runId: text('run_id').notNull(),
  attachedAt: ts('attached_at').notNull().defaultNow(),
})

export const targets = pgTable('targets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  credentialsRef: text('credentials_ref'),
})

export const environments = pgTable('environments', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  targetId: text('target_id').notNull(),
  topology: text('topology').notNull().default(''),
  claimedBy: text('claimed_by'),
  claimedAt: ts('claimed_at'),
  ttlSeconds: integer('ttl_seconds').notNull().default(3600),
  expiresAt: ts('expires_at'),
  state: text('state')
    .$type<'provisioning' | 'ready' | 'in_use' | 'reaping' | 'destroyed'>()
    .notNull(),
  artifactVersion: text('artifact_version'),
  configCommit: text('config_commit'),
  workOrderId: text('work_order_id'),
})

export const openQuestions = pgTable('open_questions', {
  id: text('id').primaryKey(),
  componentId: text('component_id').notNull(),
  question: text('question').notNull(),
  raisedBy: text('raised_by').notNull(),
  raisedAt: ts('raised_at').notNull().defaultNow(),
  workOrderId: text('work_order_id'),
  answeredAt: ts('answered_at'),
})

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  actorId: text('actor_id'),
  source: text('source').notNull().default('api'),
  occurredAt: ts('occurred_at').notNull().defaultNow(),
  recordedAt: ts('recorded_at').notNull().defaultNow(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  idempotencyKey: text('idempotency_key'),
})

export const contextPacks = pgTable('context_packs', {
  id: text('id').primaryKey(),
  workOrderId: text('work_order_id'),
  repoId: text('repo_id'),
  requestedBy: text('requested_by'),
  purpose: text('purpose').$type<'execution' | 'generative'>().notNull(),
  assemblerVersion: text('assembler_version').notNull().default('1'),
  budgetTokens: integer('budget_tokens').notNull(),
  usedTokens: integer('used_tokens').notNull(),
  items: jsonb('items').$type<unknown[]>().notNull().default([]),
  omitted: jsonb('omitted').$type<unknown[]>().notNull().default([]),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const generatedRules = pgTable('generated_rules', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').notNull(),
  componentId: text('component_id'),
  decisionId: text('decision_id').notNull(),
  path: text('path').notNull(),
  pathGlobs: text('path_globs').array().notNull().default([]),
  contentHash: text('content_hash').notNull(),
  state: text('state')
    .$type<'proposed' | 'applied' | 'removal_proposed' | 'removed'>()
    .notNull(),
  generatedAt: ts('generated_at').notNull().defaultNow(),
})

export const secrets = pgTable('secrets', {
  id: text('id').primaryKey(),
  scope: text('scope').notNull(),
  name: text('name').notNull(),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})
