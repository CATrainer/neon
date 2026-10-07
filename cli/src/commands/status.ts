import { api } from '../api.js'
import { resolveSession } from '../context.js'

interface Run {
  id: string
  result: string
  startedAt: string
  citable: boolean
}

/** What this checkout is working on, in the fewest lines that answer it. */
export async function status(_args: string[]): Promise<void> {
  const session = await resolveSession()

  if (!session.root) {
    console.log('not inside a git repository')
    return
  }
  if (!session.repo) {
    console.log(`${session.remote ?? 'no remote'} — not registered with Neon`)
    console.log('register it: neon repo register --kind code')
    return
  }

  console.log(`repo    ${session.repo.name} (${session.repo.kind})`)
  console.log(`branch  ${session.branch ?? 'unknown'}`)

  if (!session.change) {
    console.log('work    none claimed on this branch')
    return
  }

  console.log(
    `work    ${session.workOrder?.key ?? '?'} — ${session.workOrder?.title ?? ''} [${session.workOrder?.state ?? '?'}]`,
  )
  console.log(`change  ${session.change.id} (${session.change.state})`)
  if (session.change.specRef) console.log(`record  ${session.change.specRef}`)

  const { runs } = await api<{ runs: Run[] }>('GET', `/api/runs?changeId=${session.change.id}&limit=5`)
  if (runs.length === 0) {
    console.log('runs    none yet — neon check')
    return
  }
  console.log('runs')
  for (const run of runs) {
    console.log(
      `  ${run.result.padEnd(5)} ${run.startedAt.slice(0, 19).replace('T', ' ')}  ${run.id}${
        run.citable ? '' : ' (not citable)'
      }`,
    )
  }
}
