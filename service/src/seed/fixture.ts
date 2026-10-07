import { hashContent, hashParams } from '@neon/core'
import { sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import {
  changes,
  checks,
  components,
  contextPacks,
  decisionEvidence,
  decisions,
  environments,
  events,
  generatedRules,
  ideas,
  interfaceContracts,
  openQuestions,
  repos,
  runs,
  targets,
  users,
  workOrders,
} from '../db/schema.js'

/**
 * The local instance is a test target, not where real work lives.
 *
 * This fixture exists to exercise every path in the system, including the ones
 * that are easy to leave untested: inquiry work as well as code work, ideas
 * near expiry as well as fresh ones, runs that are deliberately not citable,
 * and a decision whose rejected alternative is the kind of thing someone will
 * propose again in six months.
 *
 * Ids are readable and stable so re-seeding is idempotent and so a failing test
 * names something you can find.
 */

const DAY = 24 * 60 * 60 * 1000

export interface SeedOptions {
  /** Wipe first. The default: a fixture that accumulates is not a fixture. */
  reset?: boolean
  now?: Date
}

export async function seed(db: Db, options: SeedOptions = {}) {
  const now = options.now ?? new Date()
  const ago = (days: number) => new Date(now.getTime() - days * DAY)
  const inDays = (days: number) => new Date(now.getTime() + days * DAY)

  if (options.reset !== false) await reset(db)

  // -- People ---------------------------------------------------------------
  await db.insert(users).values([
    { id: 'usr-ada', name: 'Ada Bram', email: 'ada@example.com', githubLogin: 'adabram' },
    { id: 'usr-pete', name: 'Pete Sandoval', email: 'pete@example.com', githubLogin: 'psandoval' },
    { id: 'usr-mira', name: 'Mira Okonjo', email: 'mira@example.com', githubLogin: 'mokonjo' },
  ])

  // -- Repos: one of code, one of knowledge ---------------------------------
  await db.insert(repos).values([
    {
      id: 'repo-atlas',
      name: 'atlas',
      remoteUrl: 'https://github.com/neon-fixture/atlas',
      kind: 'code',
      keyPrefix: 'ATL',
      registeredAt: ago(120),
    },
    {
      id: 'repo-canon',
      name: 'canon',
      remoteUrl: 'https://github.com/neon-fixture/canon',
      kind: 'knowledge',
      keyPrefix: 'CAN',
      registeredAt: ago(118),
    },
  ])

  await db.insert(components).values([
    {
      id: 'cmp-ingest',
      repoId: 'repo-atlas',
      name: 'ingest',
      pathGlobs: ['src/ingest/**'],
      description: 'Pulls source documents and normalises them into records.',
    },
    {
      id: 'cmp-retrieval',
      repoId: 'repo-atlas',
      name: 'retrieval',
      pathGlobs: ['src/retrieval/**', 'src/rank/**'],
      description: 'Query understanding, candidate generation and ranking.',
    },
    {
      id: 'cmp-api',
      repoId: 'repo-atlas',
      name: 'api',
      pathGlobs: ['src/api/**'],
      description: 'The public HTTP surface.',
    },
    {
      id: 'cmp-ontology',
      repoId: 'repo-canon',
      name: 'ontology',
      pathGlobs: ['ontology/**'],
      description: 'The entity and relationship model everything else agrees on.',
    },
  ])

  await db.insert(interfaceContracts).values([
    {
      id: 'ctr-record-v2',
      name: 'record',
      version: '2.1.0',
      publisherComponentId: 'cmp-ingest',
      consumerComponentIds: ['cmp-retrieval', 'cmp-api'],
      artifactRef: 'contracts/record.v2.schema.json',
    },
    {
      id: 'ctr-query-v1',
      name: 'query',
      version: '1.4.0',
      publisherComponentId: 'cmp-api',
      consumerComponentIds: ['cmp-retrieval'],
      artifactRef: 'contracts/query.v1.schema.json',
    },
  ])

  // -- Checks: one of every kind that has an adapter, plus one that does not --
  await db.insert(checks).values([
    {
      id: 'chk-noop',
      repoId: null,
      name: 'noop',
      kind: 'noop',
      description: 'Always passes. For proving the loop.',
    },
    {
      id: 'chk-tests-unit',
      repoId: 'repo-atlas',
      name: 'tests.unit',
      kind: 'command',
      runnerRef: 'npm test',
      description: 'Unit tests.',
    },
    {
      id: 'chk-lint',
      repoId: 'repo-atlas',
      name: 'lint',
      kind: 'command',
      runnerRef: 'npm run lint',
      description: 'Formatter and linter.',
    },
    {
      id: 'chk-record-schema',
      repoId: 'repo-canon',
      name: 'record.schema',
      kind: 'schema',
      description: 'A record exists and has the fields its kind requires.',
      defaultParams: { kind: 'decision' },
    },
    {
      id: 'chk-eval-retrieval',
      repoId: 'repo-atlas',
      name: 'eval.retrieval',
      kind: 'command',
      runnerRef: 'npm run eval -- --suite $suite',
      requiresFixture: true,
      description: 'Scored retrieval evaluation against a pinned fixture.',
      defaultParams: { suite: 'core-flows' },
    },
    {
      // Declared but unusable until the prompt adapter lands. Left here on
      // purpose: a check whose kind has no adapter must fail loudly at run
      // time rather than silently pass.
      id: 'chk-inquiry-review',
      repoId: 'repo-canon',
      name: 'inquiry.review',
      kind: 'prompt',
      description: 'Adversarial review of a record against stated criteria.',
    },
  ])

  // -- Ideas: various ages, including some about to go quietly ---------------
  const idea = (
    id: string,
    title: string,
    body: string,
    capturedDaysAgo: number,
    expiresInDays: number,
    extra: Partial<typeof ideas.$inferInsert> = {},
  ): typeof ideas.$inferInsert => ({
    id,
    title,
    body,
    source: 'session',
    capturedBy: 'usr-ada',
    capturedAt: ago(capturedDaysAgo),
    touchedAt: ago(capturedDaysAgo),
    state: 'open',
    expiresAt: inDays(expiresInDays),
    tags: [],
    relatedIds: [],
    promotedToWorkOrderId: null,
    repoId: null,
    searchText: `${title}\n${body}`,
    ...extra,
  })

  await db.insert(ideas).values([
    idea(
      'idea-hybrid-retrieval',
      'Try hybrid retrieval instead of dense-only',
      'Dense retrieval keeps missing exact identifiers — part numbers, statute references. A sparse pass alongside it might fix the class of failure we keep seeing in support tickets.',
      3,
      57,
    ),
    idea(
      'idea-ingest-backpressure',
      'Ingest needs backpressure',
      'When a source bursts we queue everything in memory and the pod dies. Something as simple as a bounded queue would do.',
      12,
      48,
      { tags: ['reliability'] },
    ),
    idea(
      'idea-ontology-versioning',
      'Version the ontology like an interface contract',
      'Consumers break silently when the ontology moves. It behaves like a published contract, so maybe it should be one.',
      52,
      8,
      { capturedBy: 'usr-mira' },
    ),
    idea(
      'idea-cache-embeddings',
      'Cache embeddings across runs',
      'Re-embedding the same corpus every eval run is most of the wall clock.',
      58,
      2,
      { capturedBy: 'usr-pete' },
    ),
    idea(
      'idea-rerank-cross-encoder',
      'Add a cross-encoder reranker',
      'Rerank the top 50 with a cross-encoder. Slower per query but much better ordering.',
      70,
      -3,
      { state: 'expired' },
    ),
    idea(
      'idea-promoted-observability',
      'We cannot see which constraint an agent actually received',
      'Packs are assembled and then forgotten. If we logged them we could tell whether the constraint that would have prevented a mistake was even in the pack.',
      30,
      30,
      { state: 'promoted', promotedToWorkOrderId: 'wo-pack-logging' },
    ),
  ])

  // -- Work orders: both kinds, every state ---------------------------------
  await db.insert(workOrders).values([
    {
      id: 'wo-pack-logging',
      key: 'ATL-101',
      kind: 'code',
      title: 'Log every assembled context pack',
      intent:
        'We cannot evaluate retrieval quality without a record of what was actually served, and the packs are unrecoverable once the call returns.',
      state: 'done',
      acceptanceCriteria: [
        'every pack is persisted with its items, scores and stated reasons',
        'omissions are recorded, not just what was included',
      ],
      doneWhen: [{ check: 'tests.unit' }, { check: 'lint' }],
      declaredComponentIds: ['cmp-retrieval'],
      createdBy: 'usr-ada',
      blockedBy: [],
      supersedes: null,
      originIdeaId: 'idea-promoted-observability',
      repoId: 'repo-atlas',
      createdAt: ago(29),
      updatedAt: ago(9),
    },
    {
      id: 'wo-backpressure',
      key: 'ATL-102',
      kind: 'code',
      title: 'Bound the ingest queue',
      intent:
        'A burst from one source takes the whole ingest path down, which looks to everyone else like data loss.',
      state: 'in_progress',
      acceptanceCriteria: [
        'the queue has a configurable bound',
        'over the bound, the source is slowed rather than dropped',
        'a burst that would previously have killed the pod is covered by a test',
      ],
      doneWhen: [
        { check: 'tests.unit' },
        { check: 'lint' },
        {
          check: 'eval.retrieval',
          params: { suite: 'core-flows' },
          threshold: { minScore: 0.82, noRegressionVs: 'baseline' },
        },
      ],
      declaredComponentIds: ['cmp-ingest'],
      createdBy: 'usr-pete',
      blockedBy: [],
      supersedes: null,
      originIdeaId: null,
      repoId: 'repo-atlas',
      createdAt: ago(11),
      updatedAt: ago(1),
    },
    {
      id: 'wo-identifier-recall',
      key: 'ATL-103',
      kind: 'code',
      title: 'Recall exact identifiers in retrieval',
      intent:
        'Dense-only retrieval misses exact identifiers, which is the failure class most visible to users.',
      state: 'ready',
      acceptanceCriteria: [
        'identifier queries return the exact record in the top 3',
        'no regression on the core-flows suite',
      ],
      doneWhen: [
        { check: 'tests.unit' },
        {
          check: 'eval.retrieval',
          params: { suite: 'identifiers' },
          threshold: { minScore: 0.9 },
        },
      ],
      declaredComponentIds: ['cmp-retrieval'],
      createdBy: 'usr-ada',
      blockedBy: [],
      supersedes: null,
      originIdeaId: null,
      repoId: 'repo-atlas',
      createdAt: ago(6),
      updatedAt: ago(6),
    },
    {
      id: 'wo-api-pagination',
      key: 'ATL-104',
      kind: 'code',
      title: 'Paginate the records endpoint',
      intent: 'Large tenants time out on the unpaginated list endpoint.',
      state: 'draft',
      acceptanceCriteria: ['cursor pagination on /records'],
      doneWhen: [],
      declaredComponentIds: ['cmp-api'],
      createdBy: 'usr-mira',
      blockedBy: [],
      supersedes: null,
      originIdeaId: null,
      repoId: 'repo-atlas',
      createdAt: ago(4),
      updatedAt: ago(4),
    },
    {
      id: 'wo-blocked-migration',
      key: 'ATL-105',
      kind: 'code',
      title: 'Migrate records to contract v2.1',
      intent: 'Consumers are pinned to a version the publisher no longer emits.',
      state: 'blocked',
      acceptanceCriteria: ['all consumers read v2.1'],
      doneWhen: [{ check: 'tests.unit' }],
      declaredComponentIds: ['cmp-ingest', 'cmp-api'],
      createdBy: 'usr-pete',
      blockedBy: ['wo-backpressure'],
      supersedes: null,
      originIdeaId: null,
      repoId: 'repo-atlas',
      createdAt: ago(20),
      updatedAt: ago(2),
    },
    // Inquiry work: produces records, not commits. Same machinery.
    {
      id: 'wo-ranking-inquiry',
      key: 'CAN-201',
      kind: 'inquiry',
      title: 'Decide how ranking quality is judged',
      intent:
        'Two people disagree about whether ranking is better, and neither position is falsifiable as stated. Until there is an agreed measure the argument recurs monthly.',
      state: 'in_progress',
      acceptanceCriteria: [
        'a decision record naming the measure and its limits',
        'at least one alternative measure considered and rejected with reasoning',
        'states what evidence would change the conclusion',
      ],
      doneWhen: [
        {
          check: 'record.schema',
          params: { kind: 'decision' },
        },
      ],
      declaredComponentIds: ['cmp-ontology', 'cmp-retrieval'],
      createdBy: 'usr-mira',
      blockedBy: [],
      supersedes: null,
      originIdeaId: null,
      repoId: 'repo-canon',
      createdAt: ago(8),
      updatedAt: ago(3),
    },
    {
      id: 'wo-abandoned-vector-db',
      key: 'ATL-106',
      kind: 'code',
      title: 'Move to a managed vector database',
      intent: 'Self-hosting the index is operational load nobody wants.',
      state: 'abandoned',
      acceptanceCriteria: ['the index is managed'],
      doneWhen: [],
      declaredComponentIds: ['cmp-retrieval'],
      createdBy: 'usr-pete',
      blockedBy: [],
      supersedes: null,
      originIdeaId: null,
      repoId: 'repo-atlas',
      createdAt: ago(75),
      updatedAt: ago(60),
    },
  ])

  await db.insert(changes).values([
    {
      id: 'chg-pack-logging',
      workOrderId: 'wo-pack-logging',
      repoId: 'repo-atlas',
      branch: 'neon/work/atl-101-log-every-assembled-context-pack',
      prUrl: 'https://github.com/neon-fixture/atlas/pull/318',
      specRef: 'openspec/changes/atl-101-log-every-assembled-context-pack/proposal.md',
      specContentHash: hashContent('a pack log proposal'),
      dependsOn: [],
      state: 'merged',
      claimedBy: 'usr-ada',
      createdAt: ago(29),
      updatedAt: ago(9),
    },
    {
      id: 'chg-backpressure',
      workOrderId: 'wo-backpressure',
      repoId: 'repo-atlas',
      branch: 'neon/work/atl-102-bound-the-ingest-queue',
      prUrl: null,
      specRef: 'openspec/changes/atl-102-bound-the-ingest-queue/proposal.md',
      specContentHash: hashContent('a backpressure proposal'),
      dependsOn: [],
      state: 'claimed',
      claimedBy: 'usr-pete',
      createdAt: ago(2),
      updatedAt: ago(1),
    },
    {
      id: 'chg-ranking-inquiry',
      workOrderId: 'wo-ranking-inquiry',
      repoId: 'repo-canon',
      branch: 'neon/inquiry/can-201-decide-how-ranking-quality-is-judged',
      prUrl: null,
      specRef: 'records/can-201-decide-how-ranking-quality-is-judged.md',
      specContentHash: null,
      dependsOn: [],
      state: 'claimed',
      claimedBy: 'usr-mira',
      createdAt: ago(3),
      updatedAt: ago(3),
    },
  ])

  // -- Runs: citable and deliberately not ------------------------------------
  const evalParams = { suite: 'core-flows' }
  await db.insert(runs).values([
    {
      id: 'run-eval-baseline',
      checkId: 'chk-eval-retrieval',
      changeId: null,
      workOrderId: null,
      startedAt: ago(21),
      endedAt: ago(21),
      artifactVersion: 'atlas@1.8.0',
      configCommit: 'c0ffee1',
      fixtureVersion: 'baseline-v2',
      paramsResolved: evalParams,
      paramsHash: hashParams(evalParams),
      result: 'pass',
      score: 0.84,
      artifacts: [],
      trigger: 'ci',
      triggeredBy: 'usr-ada',
      citable: true,
    },
    {
      id: 'run-eval-regressed',
      checkId: 'chk-eval-retrieval',
      changeId: 'chg-backpressure',
      workOrderId: 'wo-backpressure',
      startedAt: ago(1),
      endedAt: ago(1),
      artifactVersion: 'atlas@1.9.0-rc1',
      configCommit: 'deadbee',
      fixtureVersion: 'baseline-v2',
      paramsResolved: evalParams,
      paramsHash: hashParams(evalParams),
      result: 'fail',
      score: 0.79,
      baselineRunId: 'run-eval-baseline',
      delta: -0.05,
      artifacts: [
        {
          id: 'art-eval-report',
          name: 'eval-report.json',
          kind: 'report',
          sizeBytes: 18422,
          preview: '{"suite":"core-flows","failed":["identifier-exact-match", "cross-doc-join"]}',
        },
      ],
      trigger: 'local',
      triggeredBy: 'usr-pete',
      citable: true,
      failureSummary: 'scored 0.79 against a required 0.82, regressed 0.05 against baseline',
    },
    {
      // Not citable: no artifact version, no config commit. It can still gate
      // the work — it just cannot become evidence.
      id: 'run-tests-local',
      checkId: 'chk-tests-unit',
      changeId: 'chg-backpressure',
      workOrderId: 'wo-backpressure',
      startedAt: ago(1),
      endedAt: ago(1),
      paramsResolved: {},
      paramsHash: hashParams({}),
      result: 'pass',
      artifacts: [],
      trigger: 'local',
      triggeredBy: 'usr-pete',
      citable: false,
    },
    {
      id: 'run-tests-merged',
      checkId: 'chk-tests-unit',
      changeId: 'chg-pack-logging',
      workOrderId: 'wo-pack-logging',
      startedAt: ago(9),
      endedAt: ago(9),
      artifactVersion: 'atlas@1.8.4',
      configCommit: 'ba5eba1',
      paramsResolved: {},
      paramsHash: hashParams({}),
      result: 'pass',
      artifacts: [],
      trigger: 'ci',
      triggeredBy: 'usr-ada',
      citable: true,
    },
  ])

  // -- Decisions, including the material the generative side reads -----------
  await db.insert(decisions).values([
    {
      id: 'dec-dense-only',
      key: 'D-11',
      title: 'Retrieval is dense-only for now',
      rationale:
        'A single dense index is one thing to operate and one thing to tune, and at current corpus size it answers the questions people actually ask.',
      rejectedAlternatives: [
        {
          title: 'Hybrid sparse + dense retrieval',
          why: 'Two indexes to keep in sync and a fusion step to tune, for a gain we could not measure at the corpus size we had in March. Revisit if exact-identifier recall becomes the dominant failure.',
        },
        {
          title: 'Cross-encoder reranking of the top 50',
          why: 'Latency budget was 200ms end to end and the reranker alone was 340ms on the hardware we had.',
        },
      ],
      componentIds: ['cmp-retrieval'],
      state: 'accepted',
      authorId: 'usr-ada',
      decidedAt: ago(140),
      workOrderIds: [],
      recordRef: 'decisions/d-11-dense-only-retrieval.md',
      recordContentHash: hashContent('dense only'),
      searchText:
        'Retrieval is dense-only for now\nHybrid sparse + dense retrieval\nCross-encoder reranking of the top 50\nexact identifier recall latency budget',
    },
    {
      id: 'dec-ingest-idempotent',
      key: 'D-12',
      title: 'Ingest is idempotent by content hash',
      rationale:
        'Sources replay. Deduplicating on a content hash makes replay free and makes the pipeline restartable anywhere.',
      rejectedAlternatives: [
        {
          title: 'Deduplicate on source-provided ids',
          why: 'Two sources reuse ids across tenants, so the id is only unique in context we do not always have.',
        },
      ],
      componentIds: ['cmp-ingest'],
      state: 'accepted',
      authorId: 'usr-pete',
      decidedAt: ago(96),
      workOrderIds: [],
      recordRef: 'decisions/d-12-idempotent-ingest.md',
      recordContentHash: hashContent('idempotent ingest'),
      searchText: 'Ingest is idempotent by content hash\nDeduplicate on source-provided ids',
    },
    {
      id: 'dec-ranking-measure',
      key: 'D-13',
      title: 'How ranking quality is measured is unsettled',
      rationale:
        'One position holds that nDCG on the golden set is sufficient; the other that it rewards exactly the ordering we already produce and cannot detect the identifier failures users report.',
      rejectedAlternatives: [],
      componentIds: ['cmp-retrieval'],
      state: 'contested',
      settlingCondition:
        'An eval run on the identifiers suite where the two measures disagree about which of two rankers is better.',
      positions: [
        { holder: 'usr-ada', summary: 'nDCG@10 on the golden set, one number, comparable over time.' },
        {
          holder: 'usr-mira',
          summary:
            'Recall of must-hit records per query class, because the failures people report are misses, not orderings.',
        },
      ],
      authorId: 'usr-mira',
      decidedAt: ago(8),
      workOrderIds: ['wo-ranking-inquiry'],
      recordRef: null,
      recordContentHash: null,
      searchText:
        'How ranking quality is measured is unsettled nDCG golden set recall must-hit records',
    },
    {
      id: 'dec-superseded-batch',
      key: 'D-9',
      title: 'Ingest runs as a nightly batch',
      rationale: 'Simplest thing that worked when there were two sources.',
      rejectedAlternatives: [
        {
          title: 'Streaming ingest',
          why: 'Nobody needed freshness under a day, and streaming meant operating a broker.',
        },
      ],
      componentIds: ['cmp-ingest'],
      state: 'superseded',
      supersededBy: 'dec-ingest-idempotent',
      authorId: 'usr-pete',
      decidedAt: ago(200),
      workOrderIds: [],
      recordRef: 'decisions/d-9-nightly-batch.md',
      recordContentHash: hashContent('nightly batch'),
      searchText: 'Ingest runs as a nightly batch\nStreaming ingest',
    },
  ])

  // Only citable runs can be evidence — the trigger enforces it, so this is
  // also a test that the fixture obeys the rule it is demonstrating.
  await db.insert(decisionEvidence).values([
    { decisionId: 'dec-dense-only', runId: 'run-eval-baseline' },
  ])

  await db.insert(openQuestions).values([
    {
      id: 'oq-tenant-isolation',
      componentId: 'cmp-api',
      question: 'Is tenant isolation enforced at the query layer or only at the API boundary?',
      raisedBy: 'usr-mira',
      raisedAt: ago(14),
      workOrderId: null,
    },
    {
      id: 'oq-embedding-drift',
      componentId: 'cmp-retrieval',
      question: 'What happens to stored vectors when the embedding model changes?',
      raisedBy: 'usr-ada',
      raisedAt: ago(40),
      workOrderId: null,
    },
  ])

  // A rule generated from an accepted decision, already applied. The context
  // pack must leave this constraint out: it loads itself when the agent touches
  // the files it governs.
  await db.insert(generatedRules).values([
    {
      id: 'rule-ingest-idempotent',
      repoId: 'repo-atlas',
      componentId: 'cmp-ingest',
      decisionId: 'dec-ingest-idempotent',
      // Where the generator puts it: beside the files it governs, so an agent
      // picks it up by touching them rather than by asking.
      path: 'src/ingest/CLAUDE.md',
      pathGlobs: ['src/ingest/**'],
      contentHash: hashContent('ingest idempotency rule'),
      state: 'applied',
      generatedAt: ago(90),
    },
  ])

  await db.insert(targets).values([
    {
      id: 'tgt-docker-local',
      name: 'docker-local',
      kind: 'docker',
      config: { network: 'neon-lab' },
      credentialsRef: null,
    },
  ])

  await db.insert(environments).values([
    {
      id: 'env-lab-1',
      name: 'lab-1',
      targetId: 'tgt-docker-local',
      topology: 'single-node',
      claimedBy: null,
      claimedAt: null,
      ttlSeconds: 3600,
      expiresAt: null,
      state: 'destroyed',
      workOrderId: null,
    },
  ])

  // Keys minted after this point must not collide with the fixture's.
  await db.execute(sql`SELECT setval('work_order_key_seq', 300)`)
  await db.execute(sql`SELECT setval('decision_key_seq', 20)`)

  return {
    users: 3,
    repos: 2,
    workOrders: 7,
    ideas: 6,
    decisions: 4,
    runs: 4,
  }
}

async function reset(db: Db) {
  // Order matters less than honesty: truncate everything the fixture writes,
  // cascading so evidence and events go with it.
  await db.execute(sql`
    TRUNCATE TABLE
      ${contextPacks}, ${generatedRules}, ${decisionEvidence}, ${events},
      ${runs}, ${checks}, ${changes}, ${workOrders}, ${ideas}, ${decisions},
      ${openQuestions}, ${interfaceContracts}, ${components}, ${environments},
      ${targets}, ${repos}, ${users}
    RESTART IDENTITY CASCADE
  `)
}
