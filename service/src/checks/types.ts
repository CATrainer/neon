import type { CheckKind, DoneWhenClause, RunArtifact } from '@neon/core'
import type { checks, changes, repos, workOrders } from '../db/schema.js'

/**
 * The check adapter seam.
 *
 * This is the most important interface in the system: adding a new kind of
 * evidence must never require a schema change, only a new adapter and a line in
 * a repo's `neon.checks.yaml`. Four kinds are planned — noop, command, schema,
 * prompt — and the interface is designed against all four even where only some
 * are implemented.
 */

export type Params = Record<string, string | number | boolean>

/** A check as declared in a repo's neon.checks.yaml. */
export interface CheckDeclaration {
  name: string
  kind: CheckKind
  /** Opaque to the core; each adapter defines its own meaning. */
  runnerRef?: string
  description?: string
  requiresEnvironment?: boolean
  requiresFixture?: boolean
  defaultParams?: Params
  resultSchema?: unknown
}

export interface CheckContext {
  check: typeof checks.$inferSelect
  /** Check defaults merged with the work order's clause params. */
  params: Params
  threshold: DoneWhenClause['threshold']
  workOrder: typeof workOrders.$inferSelect
  change: typeof changes.$inferSelect | null
  repo: typeof repos.$inferSelect | null
  /** Absolute path to the checkout, when the runner has one. Adapters that
   *  need a working tree must fail cleanly when this is absent. */
  workdir: string | null
  log: (message: string) => void
}

/** Version pins an adapter can contribute. Their presence decides citability. */
export interface RunPins {
  artifactVersion?: string | null
  configCommit?: string | null
  fixtureVersion?: string | null
}

export interface CheckOutcome {
  result: 'pass' | 'fail' | 'error'
  /** Scored checks only. A threshold against a null score is a failure. */
  score?: number | null
  /** One line, on failure: the thing you actually need. */
  failureSummary?: string | null
  artifacts?: RunArtifact[]
  pins?: RunPins
  /** `prompt` adapters record the model so the result stays interpretable. */
  evaluatorModel?: string | null
}

export interface CheckAdapter {
  kind: CheckKind
  /** Validate a declaration at registration time, so a broken check is caught
   *  when the repo is synced rather than when someone's work is blocked. */
  validate(declaration: CheckDeclaration): string[]
  run(ctx: CheckContext): Promise<CheckOutcome>
}
