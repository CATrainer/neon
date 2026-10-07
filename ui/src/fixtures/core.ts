import { ago } from './time'
import type {
  Check,
  Component,
  InterfaceContract,
  OpenQuestion,
  Repo,
  Target,
  User,
} from './types'

/**
 * A fictional five-person team — Meridian — building a B2B scheduling and
 * dispatch platform. Names, titles and paths are deliberately uneven; a
 * layout that only survives tidy data is not a layout.
 */

export const users: User[] = [
  {
    id: 'u_priya',
    name: 'Priya Raghunathan',
    short: 'Priya',
    email: 'priya@meridianops.io',
    githubLogin: 'praghu',
    accent: '#7DD3FC',
  },
  {
    id: 'u_tomas',
    name: 'Tomás Okonkwo-Bell',
    short: 'Tomás',
    email: 'tomas@meridianops.io',
    githubLogin: 'tokonkwobell',
    accent: '#FDBA74',
  },
  {
    id: 'u_wei',
    name: 'Wei Zhang',
    short: 'Wei',
    email: 'wei@meridianops.io',
    githubLogin: 'weiz',
    accent: '#C4B5FD',
  },
  {
    id: 'u_marguerite',
    name: 'Marguerite Delacroix-Ferreira',
    short: 'Marguerite',
    email: 'marguerite@meridianops.io',
    githubLogin: 'mdelacroixferreira',
    accent: '#6EE7B7',
  },
  {
    id: 'u_sam',
    name: 'Sam Ó Braonáin',
    short: 'Sam',
    email: 'sam@meridianops.io',
    githubLogin: 'sobraonain',
    accent: '#F9A8D4',
  },
]

export const repos: Repo[] = [
  {
    id: 'r_api',
    name: 'dispatch-api',
    remoteUrl: 'github.com/meridianops/dispatch-api',
    kind: 'code',
    defaultBranch: 'main',
    registeredAt: ago({ d: 96 }),
  },
  {
    id: 'r_web',
    name: 'dispatch-web',
    remoteUrl: 'github.com/meridianops/dispatch-web',
    kind: 'code',
    defaultBranch: 'main',
    registeredAt: ago({ d: 96 }),
  },
  {
    id: 'r_infra',
    name: 'platform-infra',
    remoteUrl: 'github.com/meridianops/platform-infra',
    kind: 'config',
    defaultBranch: 'main',
    registeredAt: ago({ d: 91 }),
  },
]

export const targets: Target[] = [
  { id: 't_local', name: 'docker-local', kind: 'docker-local' },
  { id: 't_sbx', name: 'aws-sandbox', kind: 'aws-sandbox', region: 'eu-west-1' },
  { id: 't_stg', name: 'aws-staging', kind: 'aws-staging', region: 'eu-west-1' },
]

export const components: Component[] = [
  {
    id: 'c_sched',
    repoId: 'r_api',
    name: 'scheduling-core',
    pathGlobs: ['src/scheduling/**'],
    description:
      'Slot model, availability windows, and the constraint solver front-end. Owns the definition of a bookable slot.',
  },
  {
    id: 'c_dispatch',
    repoId: 'r_api',
    name: 'dispatch-engine',
    pathGlobs: ['src/dispatch/**', 'src/assignment/**'],
    description:
      'Assigns jobs to technicians. Consumes routing solutions, emits assignment events.',
  },
  {
    id: 'c_routing',
    repoId: 'r_api',
    name: 'routing-optimizer',
    pathGlobs: ['src/routing/**', 'vendor/ortools-bridge/**'],
    description:
      'Vehicle-routing solver bridge. Wraps OR-Tools behind a request/solution contract so the solver can be replaced.',
  },
  {
    id: 'c_eta',
    repoId: 'r_api',
    name: 'eta-service',
    pathGlobs: ['src/eta/**'],
    description:
      'Predicted arrival windows from live telematics and historical travel times.',
  },
  {
    id: 'c_notify',
    repoId: 'r_api',
    name: 'notifications',
    pathGlobs: ['src/notify/**', 'templates/**'],
    description:
      'Outbound SMS, email and push. Template rendering, quiet hours, per-tenant sender identity.',
  },
  {
    id: 'c_billing',
    repoId: 'r_api',
    name: 'billing-adapter',
    pathGlobs: ['src/billing/**'],
    description:
      'Emits metered usage events to the billing provider. Idempotent, replayable.',
  },
  {
    id: 'c_auth',
    repoId: 'r_api',
    name: 'auth-gateway',
    pathGlobs: ['src/auth/**', 'src/middleware/session*.ts'],
    description:
      'Session issuance, tenant scoping, and the service-to-service token exchange.',
  },
  {
    id: 'c_egress',
    repoId: 'r_api',
    name: 'webhook-egress',
    pathGlobs: ['src/webhooks/**'],
    description:
      'Customer-facing webhook delivery with retry, signing and dead-lettering.',
  },
  {
    id: 'c_shell',
    repoId: 'r_web',
    name: 'web-shell',
    pathGlobs: ['app/**', 'src/shell/**'],
    description:
      'Routing, session bootstrap, tenant switcher and the global layout frame.',
  },
  {
    id: 'c_board',
    repoId: 'r_web',
    name: 'schedule-board-ui',
    pathGlobs: ['src/features/board/**'],
    description:
      'The drag-and-drop day board. The screen dispatchers stare at for eight hours.',
  },
  {
    id: 'c_console',
    repoId: 'r_web',
    name: 'dispatcher-console',
    pathGlobs: ['src/features/console/**'],
    description:
      'Job detail, technician timeline, manual override and the exception queue.',
  },
  {
    id: 'c_tf',
    repoId: 'r_infra',
    name: 'terraform-modules',
    pathGlobs: ['modules/**', 'stacks/**'],
    description:
      'Reusable stacks for the API, worker pool and datastores. Every apply takes an explicit target.',
  },
  {
    id: 'c_obs',
    repoId: 'r_infra',
    name: 'observability-stack',
    pathGlobs: ['stacks/observability/**', 'dashboards/**'],
    description:
      'Metrics, traces, log routing and the alert catalogue as code.',
  },
]

export const contracts: InterfaceContract[] = [
  {
    id: 'ic_assignment',
    name: 'dispatch.assignment',
    version: 'v2',
    publisherComponentId: 'c_dispatch',
    consumerComponentIds: ['c_board', 'c_notify', 'c_billing', 'c_egress'],
    artifactRef: 'contracts/dispatch.assignment.v2.json',
  },
  {
    id: 'ic_slotquery',
    name: 'scheduling.slot-query',
    version: 'v1',
    publisherComponentId: 'c_sched',
    consumerComponentIds: ['c_board', 'c_console'],
    artifactRef: 'contracts/scheduling.slot-query.v1.json',
  },
  {
    id: 'ic_solve',
    name: 'routing.solve-request',
    version: 'v3',
    publisherComponentId: 'c_routing',
    consumerComponentIds: ['c_dispatch', 'c_eta'],
    artifactRef: 'contracts/routing.solve-request.v3.json',
  },
  {
    id: 'ic_eta',
    name: 'eta.window-estimate',
    version: 'v1',
    publisherComponentId: 'c_eta',
    consumerComponentIds: ['c_notify', 'c_console', 'c_egress'],
    artifactRef: 'contracts/eta.window-estimate.v1.json',
  },
  {
    id: 'ic_usage',
    name: 'billing.usage-event',
    version: 'v3',
    publisherComponentId: 'c_billing',
    consumerComponentIds: ['c_egress'],
    artifactRef: 'contracts/billing.usage-event.v3.json',
  },
  {
    id: 'ic_session',
    name: 'auth.session-token',
    version: 'v2',
    publisherComponentId: 'c_auth',
    consumerComponentIds: ['c_shell', 'c_console', 'c_board'],
    artifactRef: 'contracts/auth.session-token.v2.json',
  },
  {
    id: 'ic_template',
    name: 'notify.template',
    version: 'v1',
    publisherComponentId: 'c_notify',
    consumerComponentIds: ['c_console'],
    artifactRef: 'contracts/notify.template.v1.json',
  },
  {
    id: 'ic_telemetry',
    name: 'platform.telemetry-schema',
    version: 'v4',
    publisherComponentId: 'c_obs',
    consumerComponentIds: ['c_dispatch', 'c_eta', 'c_auth', 'c_shell'],
    artifactRef: 'contracts/platform.telemetry-schema.v4.json',
  },
]

export const checks: Check[] = [
  {
    id: 'ck_api_unit',
    repoId: 'r_api',
    name: 'tests.unit',
    kind: 'command',
    runnerRef: 'pnpm vitest run --coverage',
    requiresEnvironment: false,
    requiresFixture: false,
    scored: false,
    description: 'Unit suite with coverage gate at 80% on changed packages.',
  },
  {
    id: 'ck_api_integration',
    repoId: 'r_api',
    name: 'tests.integration',
    kind: 'command',
    runnerRef: 'pnpm test:integration --shard=$SHARD',
    requiresEnvironment: true,
    requiresFixture: false,
    scored: false,
    description:
      'Integration suite against a provisioned Postgres + queue topology.',
  },
  {
    id: 'ck_api_lint',
    repoId: 'r_api',
    name: 'lint',
    kind: 'command',
    runnerRef: 'pnpm lint --max-warnings=0',
    requiresEnvironment: false,
    requiresFixture: false,
    scored: false,
    description: 'ESLint and type-check, zero warnings tolerated.',
  },
  {
    id: 'ck_api_contract',
    repoId: 'r_api',
    name: 'contract.pact',
    kind: 'contract',
    runnerRef: 'pact-verifier --provider dispatch-api',
    requiresEnvironment: false,
    requiresFixture: false,
    scored: false,
    description:
      'Verifies published interface contracts against every registered consumer.',
  },
  {
    id: 'ck_api_eval_dispatch',
    repoId: 'r_api',
    name: 'eval.dispatch-quality',
    kind: 'eval',
    runnerRef: 'meridian-eval dispatch --suite=$suite --fixture=$fixture',
    requiresEnvironment: true,
    requiresFixture: true,
    scored: true,
    description:
      'Replays a pinned day of real dispatch decisions and scores assignment quality against the recorded optimum.',
    defaultParams: { suite: 'core-flows', fixture: 'baseline-v2' },
  },
  {
    id: 'ck_api_eval_eta',
    repoId: 'r_api',
    name: 'eval.eta-accuracy',
    kind: 'eval',
    runnerRef: 'meridian-eval eta --fixture=$fixture',
    requiresEnvironment: true,
    requiresFixture: true,
    scored: true,
    description:
      'Mean absolute error of predicted arrival windows over a pinned telematics corpus, normalised to a 0–1 score.',
    defaultParams: { fixture: 'telematics-q2-2026' },
  },
  {
    id: 'ck_web_unit',
    repoId: 'r_web',
    name: 'tests.unit',
    kind: 'command',
    runnerRef: 'pnpm vitest run',
    requiresEnvironment: false,
    requiresFixture: false,
    scored: false,
    description: 'Component and hook tests.',
  },
  {
    id: 'ck_web_lint',
    repoId: 'r_web',
    name: 'lint',
    kind: 'command',
    runnerRef: 'pnpm lint && pnpm tsc --noEmit',
    requiresEnvironment: false,
    requiresFixture: false,
    scored: false,
    description: 'ESLint plus a standalone type-check.',
  },
  {
    id: 'ck_web_a11y',
    repoId: 'r_web',
    name: 'a11y.axe',
    kind: 'eval',
    runnerRef: 'axe-ci --routes=$routes',
    requiresEnvironment: true,
    requiresFixture: false,
    scored: true,
    description:
      'Axe sweep over the named routes. Score is the inverse of weighted violations per route.',
    defaultParams: { routes: 'board,console,login' },
  },
  {
    id: 'ck_infra_policy',
    repoId: 'r_infra',
    name: 'policy.terraform',
    kind: 'policy',
    runnerRef: 'conftest test --policy policy/ plan.json',
    requiresEnvironment: false,
    requiresFixture: false,
    scored: false,
    description:
      'OPA policy set: no public ingress, encryption at rest, explicit target, tagged ownership.',
  },
  {
    id: 'ck_infra_plan',
    repoId: 'r_infra',
    name: 'plan.terraform',
    kind: 'command',
    runnerRef: 'terraform plan -target=$target -out plan.bin',
    requiresEnvironment: true,
    requiresFixture: false,
    scored: false,
    description:
      'Produces a plan against an explicit target and stores the plan JSON as evidence.',
  },
  {
    id: 'ck_noop',
    repoId: null,
    name: 'noop',
    kind: 'noop',
    runnerRef: 'true',
    requiresEnvironment: false,
    requiresFixture: false,
    scored: false,
    description: 'Always passes. For exercising the loop.',
  },
]

export const openQuestions: OpenQuestion[] = [
  {
    id: 'oq_1',
    componentId: 'c_routing',
    question:
      'Do we keep the OR-Tools bridge in-process once the solver runs longer than the request budget, or move it behind a queue?',
    raisedBy: 'u_wei',
    raisedAt: ago({ d: 11 }),
    workOrderId: 'wo_solver_timeout',
  },
  {
    id: 'oq_2',
    componentId: 'c_notify',
    question:
      'Quiet hours are per-tenant today. Several enterprise tenants operate across three timezones — whose local time wins?',
    raisedBy: 'u_sam',
    raisedAt: ago({ d: 4 }),
  },
  {
    id: 'oq_3',
    componentId: 'c_billing',
    question:
      'Replay after a provider outage double-counts usage if the idempotency window has rolled. Is a 30-day window enough?',
    raisedBy: 'u_marguerite',
    raisedAt: ago({ d: 19 }),
  },
  {
    id: 'oq_4',
    componentId: 'c_board',
    question:
      'The day board holds a full week in memory for scroll smoothness. At 400 technicians that is 60MB. Virtualise or cap?',
    raisedBy: 'u_tomas',
    raisedAt: ago({ d: 6 }),
  },
]
