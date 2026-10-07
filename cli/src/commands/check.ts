import { api } from '../api.js'
import { resolveSession } from '../context.js'
import { headSha, repoRoot } from '../git.js'

interface CheckReport {
  changeId: string
  workOrderKey: string
  passed: boolean
  problem?: string
  results: {
    check: string
    result: string
    runId: string
    citable: boolean
    failureSummary: string | null
    thresholdViolation: string | null
  }[]
}

/**
 * Runs the active change's definition of done.
 *
 * Exit codes are the interface here: 0 passed, 1 failed, 2 there is nothing to
 * check, 3 Neon is unreachable. The Stop hook reads them, and a hook that
 * cannot tell "failed" from "cannot tell" is a hook that either blocks forever
 * or waves everything through.
 */
export async function check(args: string[]): Promise<void> {
  const asJson = args.includes('--json')
  const explicit = valueOf(args, '--change')

  let changeId = explicit
  if (!changeId) {
    const session = await resolveSession()
    if (!session.change) {
      const message = session.repo
        ? `no active change on ${session.branch ?? 'this branch'}`
        : 'this repo is not registered with Neon'
      if (asJson) console.log(JSON.stringify({ passed: null, problem: message }))
      else console.error(message)
      process.exitCode = 2
      return
    }
    changeId = session.change.id
  }

  const report = await api<CheckReport>('POST', `/api/changes/${changeId}/check`, {
    workdir: repoRoot(),
    trigger: 'local',
    pins: { configCommit: headSha() },
  })

  if (asJson) {
    console.log(JSON.stringify(report))
  } else {
    console.log(`${report.workOrderKey}: ${report.passed ? 'passed' : 'failed'}`)
    for (const result of report.results) {
      const detail = result.thresholdViolation ?? result.failureSummary ?? ''
      console.log(`  ${result.result.padEnd(5)} ${result.check}${detail ? ` — ${detail}` : ''}`)
      if (result.runId) {
        console.log(`        run ${result.runId}${result.citable ? '' : ' (not citable as evidence)'}`)
      }
    }
    if (report.problem) console.log(`\n${report.problem}`)
  }

  if (report.problem) process.exitCode = 2
  else if (!report.passed) process.exitCode = 1
}

export function valueOf(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}
