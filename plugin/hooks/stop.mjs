import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { api, git, readInput, session } from './lib.mjs'

/**
 * The Stop hook: an agent may not end its turn claiming success while the
 * definition of done fails.
 *
 * Three rules keep this from becoming the thing people uninstall:
 *
 *   - it never loops forever: after BLOCK_CEILING consecutive blocks in a
 *     session it stands aside and says so, and a pass resets the count. It
 *     does not stand aside merely because `stop_hook_active` is set — that
 *     made the gate one-shot, letting the agent's second attempt to stop in a
 *     turn through with the checks still failing (NEON-D-013);
 *   - it is overridable, explicitly, by the person — not by the agent talking
 *     itself out of it. The only override is NEON_SKIP_CHECKS=1 in the
 *     environment Claude Code was launched with: the agent's shell commands
 *     run in child processes and cannot change it (NEON-D-009);
 *   - when it cannot tell (no change, no repo, Neon unreachable) it does
 *     nothing at all. A gate that fires when confused gets removed.
 */
const BLOCK_CEILING = 3

const input = await readInput()
const cwd = input.cwd ?? process.cwd()

if (process.env.NEON_SKIP_CHECKS === '1') {
  console.error('neon: checks skipped (NEON_SKIP_CHECKS=1 was set when this session was launched)')
  process.exit(0)
}

let context
try {
  context = await session(cwd)
} catch {
  // Neon being down blocks merges, not work.
  process.exit(0)
}

if (!context.repo || !context.change) process.exit(0)

let report
try {
  report = await api(`/api/changes/${context.change.id}/check`, {
    method: 'POST',
    body: {
      workdir: context.root,
      trigger: 'local',
      pins: { configCommit: git(['rev-parse', 'HEAD'], cwd) },
    },
  })
} catch (error) {
  console.error(`neon: could not run checks (${error.message}) — not blocking`)
  process.exit(0)
}

const state = blockState(input.session_id ?? 'unknown')

if (report.passed) {
  writeState(state.path, 0)
  process.exit(0)
}

// An empty done_when is a failure of the ladder, not of the work. Say so and
// get out of the way.
if (report.problem) {
  console.error(`neon: ${report.problem}`)
  process.exit(0)
}

if (state.blocks >= BLOCK_CEILING) {
  writeState(state.path, 0)
  console.error(
    `neon: ${report.workOrderKey} still fails its checks after ${state.blocks} attempts. Not blocking again — fix it, or say so in the work order.`,
  )
  process.exit(0)
}

writeState(state.path, state.blocks + 1)

const failures = report.results
  .filter((r) => r.result !== 'pass' || r.thresholdViolation)
  .map((r) => {
    const why = r.thresholdViolation ?? r.failureSummary ?? r.result
    return `  ${r.check}: ${why}${r.runId ? ` (run ${r.runId})` : ''}`
  })

console.error(
  [
    `${report.workOrderKey} is not done: its definition of done fails.`,
    ...failures,
    '',
    'Keep working. Run neon_check when you think it passes.',
  ].join('\n'),
)
process.exit(2)

function blockState(sessionId) {
  const dir = join(tmpdir(), 'neon-stop')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${sessionId}.json`)
  try {
    return { path, blocks: JSON.parse(readFileSync(path, 'utf8')).blocks ?? 0 }
  } catch {
    return { path, blocks: 0 }
  }
}

function writeState(path, blocks) {
  try {
    writeFileSync(path, JSON.stringify({ blocks }))
  } catch {
    // A missing counter only costs us one extra block; never fail the hook.
  }
}
