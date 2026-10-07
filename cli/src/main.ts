import { ApiError } from './api.js'
import { capture } from './commands/capture.js'
import { check } from './commands/check.js'
import { finish } from './commands/finish.js'
import { inbox } from './commands/inbox.js'
import { promote } from './commands/promote.js'
import { reconcile } from './commands/reconcile.js'
import { registerRepo, syncChecks } from './commands/repo.js'
import { rules } from './commands/rules.js'
import { recordRun } from './commands/run.js'
import { status } from './commands/status.js'

/**
 * `neon` — a thin wrapper on the API, for CI and for anything the plugin needs
 * to shell out to.
 *
 * `neon capture` matters more than it looks: it is a front door available from
 * any terminal, with no agent session and no repo context needed.
 */
const USAGE = `neon — engineering platform CLI

  neon capture "<text>"        file an idea; returns close matches and prior rejections
  neon inbox [--all]           open ideas, oldest first
  neon promote <id> --file f   turn an idea into a work order from a drafted file
  neon status                  what this checkout is working on
  neon check [--json]          run the active change's done_when; exit 1 if it fails
  neon finish [--summary s]    record completion, judged on the latest runs; refuses
              [--override r]   while they fail. --override is for a person at a terminal
  neon run record <check> ...  record a run that happened elsewhere (CI)
  neon reconcile [--since ref] draft the records that should have existed
  neon repo register [--kind]  register this repo from its git remote
  neon checks sync [file]      sync neon.checks.yaml to the service
  neon rules [--write]         path-scoped rules from decisions; never commits

Environment:
  NEON_URL   service base url (default http://localhost:4000)
`

const [command, ...rest] = process.argv.slice(2)

try {
  switch (command) {
    case 'capture':
      await capture(rest)
      break
    case 'inbox':
      await inbox(rest)
      break
    case 'promote':
      await promote(rest)
      break
    case 'status':
      await status(rest)
      break
    case 'check':
      await check(rest)
      break
    case 'finish':
      await finish(rest)
      break
    case 'run':
      await recordRun(rest)
      break
    case 'reconcile':
      await reconcile(rest)
      break
    case 'repo':
      await registerRepo(rest)
      break
    case 'checks':
      await syncChecks(rest)
      break
    case 'rules':
      await rules(rest)
      break
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      console.log(USAGE)
      break
    default:
      console.error(`unknown command: ${command}\n\n${USAGE}`)
      process.exitCode = 1
  }
} catch (err) {
  if (err instanceof ApiError) {
    console.error(`${err.code}: ${err.message}`)
    // 0 means unreachable: Neon being down blocks merges, not work, so callers
    // can tell that apart from a refusal.
    process.exitCode = err.status === 0 ? 3 : 1
  } else {
    console.error((err as Error).message)
    process.exitCode = 1
  }
}
