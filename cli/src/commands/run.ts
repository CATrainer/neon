import { api } from '../api.js'
import { valueOf } from './check.js'
import { resolveSession } from '../context.js'
import { headSha } from '../git.js'

/**
 * `neon run record <check> --result pass|fail|error [...]`
 *
 * For runs that happened somewhere else — CI, a shared runner. The pins are
 * what decide whether the result can ever be cited as evidence, so the command
 * takes them explicitly rather than inventing them.
 */
export async function recordRun(args: string[]): Promise<void> {
  const [sub, name] = args
  if (sub !== 'record' || !name) {
    console.error('neon run record <check-name> --result pass|fail|error [--score n] [--artifact-version v] [--fixture-version v]')
    process.exitCode = 1
    return
  }

  const result = valueOf(args, '--result') ?? 'pass'
  if (!['pass', 'fail', 'error'].includes(result)) {
    console.error(`--result must be pass, fail or error (got ${result})`)
    process.exitCode = 1
    return
  }

  const session = await resolveSession()
  const score = valueOf(args, '--score')

  const run = await api<{ id: string; citable: boolean }>('POST', '/api/runs', {
    checkName: name,
    repoId: session.repo?.id ?? null,
    changeId: session.change?.id ?? null,
    workOrderId: session.change ? undefined : null,
    result,
    score: score === undefined ? null : Number(score),
    trigger: valueOf(args, '--trigger') ?? 'ci',
    failureSummary: valueOf(args, '--summary') ?? null,
    pins: {
      artifactVersion: valueOf(args, '--artifact-version') ?? null,
      configCommit: valueOf(args, '--config-commit') ?? headSha(),
      fixtureVersion: valueOf(args, '--fixture-version') ?? null,
    },
  })

  console.log(`recorded ${run.id}`)
  if (!run.citable) {
    console.log(
      'not citable: without an artifact version, a config commit and (where the check needs one) a fixture version, this result cannot be attached to a decision as evidence.',
    )
  }
}
