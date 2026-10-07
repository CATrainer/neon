import { readInput, session } from './lib.mjs'

/**
 * If this checkout has live work, say so once at the start of the session.
 * Nothing more: the context pack is a deliberate act, not something that
 * arrives unasked and pushes everything else out of the window.
 */
const input = await readInput()

let context
try {
  context = await session(input.cwd ?? process.cwd())
} catch {
  process.exit(0)
}

if (!context.repo) process.exit(0)

if (!context.change) {
  console.log(
    `Neon: ${context.repo.name} is registered; no work is claimed on ${context.branch}. /neon:start <key> to claim one, /neon:capture to file an idea.`,
  )
  process.exit(0)
}

console.log(
  [
    `Neon: this branch is claimed for ${context.workOrder.key} — ${context.workOrder.title} (${context.workOrder.state}).`,
    context.change.specRef ? `Its record lives at ${context.change.specRef}.` : '',
    `Definition of done: ${
      context.workOrder.doneWhen?.map((clause) => clause.check).join(', ') || 'not set'
    }.`,
    'Run /neon:check before claiming it is finished; the Stop hook will run it anyway.',
  ]
    .filter(Boolean)
    .join(' '),
)
