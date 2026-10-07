import { createInterface } from 'node:readline/promises'
import { api, ApiError } from '../api.js'
import { resolveSession } from '../context.js'
import { headSha } from '../git.js'
import { valueOf } from './check.js'

interface FinishResult {
  change: { id: string; state: string; branch: string }
  verdict: {
    workOrderKey: string
    passed: boolean
    results: { check: string; result: string; runId: string | null; citable: boolean }[]
  }
  overridden: boolean
}

/** The terminal, as far as an override is concerned. Injected so the rule can
 *  be tested without one. */
export interface Terminal {
  interactive: boolean
  ask(question: string): Promise<string>
}

const realTerminal: Terminal = {
  interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
  async ask(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      return await rl.question(question)
    } finally {
      rl.close()
    }
  },
}

/**
 * `neon finish [--summary "..."] [--pr url] [--override "<reason>"]`
 *
 * Records completion of the active change, judged on its latest runs. The
 * service refuses while they fail. `--override` is how a person finishes
 * anyway, and it is guarded here by the one thing an agent's shell does not
 * have: a terminal. The person types the work order key to confirm. An agent
 * piping the key in has no TTY and is refused before anything is sent.
 *
 * This is a guardrail, not authentication — the REST API underneath is open to
 * anything on localhost — but every override carries its reason onto the event.
 */
export async function finish(args: string[], terminal: Terminal = realTerminal): Promise<void> {
  const reason = valueOf(args, '--override')
  const summary = valueOf(args, '--summary') ?? ''

  let changeId = valueOf(args, '--change')
  if (!changeId) {
    const session = await resolveSession()
    if (!session.change) {
      console.error(
        session.repo ? `no active change on ${session.branch ?? 'this branch'}` : 'this repo is not registered with Neon',
      )
      process.exitCode = 2
      return
    }
    changeId = session.change.id
  }

  if (reason !== undefined) {
    if (reason.trim() === '' || reason.startsWith('--')) {
      console.error('--override needs a reason: neon finish --override "why this is finishing over failing checks"')
      process.exitCode = 1
      return
    }
    if (!terminal.interactive) {
      console.error(
        'refusing: an override has to be confirmed by a person at an interactive terminal, and none is attached. Run this yourself.',
      )
      process.exitCode = 1
      return
    }
    const change = await api<{ workOrderId: string }>('GET', `/api/changes/${changeId}`)
    const workOrder = await api<{ key: string }>('GET', `/api/work-orders/${change.workOrderId}`)
    const typed = await terminal.ask(
      `Finishing ${workOrder.key} over failing checks, because: ${reason}\nType ${workOrder.key} to confirm: `,
    )
    if (typed.trim().toUpperCase() !== workOrder.key.toUpperCase()) {
      console.error('not confirmed; nothing was recorded')
      process.exitCode = 1
      return
    }
  }

  let result: FinishResult
  try {
    result = await api<FinishResult>('POST', `/api/changes/${changeId}/finish`, {
      summary,
      prUrl: valueOf(args, '--pr') ?? null,
      atCommit: headSha(),
      override: reason === undefined ? null : { reason },
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      console.error(err.message)
      process.exitCode = 1
      return
    }
    throw err
  }

  const { verdict } = result
  console.log(
    `${verdict.workOrderKey}: finished (${result.change.state})${result.overridden ? ' over failing checks — the reason is on the record' : ''}`,
  )
  for (const r of verdict.results) {
    console.log(`  ${r.result.padEnd(5)} ${r.check}${r.runId ? `  run ${r.runId}` : ''}${r.citable ? '' : ' (not citable)'}`)
  }
  console.log(`\ncommit trailer: Neon-Work-Order: ${verdict.workOrderKey}`)
}
