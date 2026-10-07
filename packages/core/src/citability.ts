import type { CheckKind } from './domain.js'

/**
 * Citability: whether a run is pinned tightly enough to be cited as evidence on
 * a decision.
 *
 * This is derived, never supplied. A run that isn't citable can still gate a
 * work order — it just cannot end up in a decision's `evidenceRunIds`, because
 * that would put an unrepeatable result where reproducible evidence belongs.
 */
export interface CitabilityInput {
  checkKind: CheckKind
  /** From the check definition: does this kind of evidence need a fixture? */
  requiresFixture: boolean
  artifactVersion: string | null | undefined
  configCommit: string | null | undefined
  fixtureVersion: string | null | undefined
  paramsHash: string | null | undefined
}

const present = (v: string | null | undefined): boolean => typeof v === 'string' && v.length > 0

/**
 * Every gap that keeps this run from being citable, in the order a person would
 * want to fix them. Empty means citable.
 */
export function citabilityGaps(input: CitabilityInput): string[] {
  // A single-turn LLM judgment is not reproducible, so no amount of pinning
  // makes it evidence. It can still fail the work, which is its job.
  if (input.checkKind === 'prompt') {
    return ['prompt checks are never citable: the judgment is not reproducible']
  }

  const gaps: string[] = []
  if (!present(input.artifactVersion)) gaps.push('no artifact_version')
  if (!present(input.configCommit)) gaps.push('no config_commit')
  if (input.requiresFixture && !present(input.fixtureVersion)) {
    gaps.push('check requires a fixture but no fixture_version was recorded')
  }
  if (!present(input.paramsHash)) gaps.push('no params_hash')
  return gaps
}

export function deriveCitable(input: CitabilityInput): boolean {
  return citabilityGaps(input).length === 0
}
