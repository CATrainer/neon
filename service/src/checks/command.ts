import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { newId, type RunArtifact } from '@neon/core'
import type { CheckAdapter, Params } from './types.js'

const run = promisify(execFile)

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const PREVIEW_CHARS = 2000

/**
 * Runs a shell command in the repo. Exit code is the verdict.
 *
 * The command comes from the repo's own `neon.checks.yaml`, so this adapter
 * runs whatever that repo's maintainers declared — the same trust boundary as a
 * CI config or a git hook, and worth stating rather than pretending otherwise.
 *
 * Parameters are substituted as `$name`, so one declared check can serve
 * several work orders with different suites or fixtures.
 */
export const commandAdapter: CheckAdapter = {
  kind: 'command',

  validate(declaration) {
    return declaration.runnerRef?.trim() ? [] : ['a command check needs a runnerRef to run']
  },

  async run(ctx) {
    if (!ctx.workdir) {
      return {
        result: 'error',
        failureSummary: `${ctx.check.name} needs a checkout to run in, and none was given. Register the repo's local path, or pass a workdir.`,
      }
    }

    const command = substitute(ctx.check.runnerRef, ctx.params)
    const timeout = Number(ctx.params.timeout_ms ?? DEFAULT_TIMEOUT_MS)
    ctx.log(`$ ${command}`)

    const started = Date.now()
    try {
      const { stdout, stderr } = await run(command, {
        cwd: ctx.workdir,
        timeout,
        shell: true,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      })
      return {
        result: 'pass',
        artifacts: outputArtifacts(stdout, stderr),
      }
    } catch (err) {
      const failure = err as NodeJS.ErrnoException & {
        stdout?: string
        stderr?: string
        code?: number | string
        killed?: boolean
      }

      // A timeout is not the work failing; it is the check failing to answer.
      if (failure.killed) {
        return {
          result: 'error',
          failureSummary: `${ctx.check.name} timed out after ${Math.round((Date.now() - started) / 1000)}s`,
          artifacts: outputArtifacts(failure.stdout, failure.stderr),
        }
      }

      return {
        result: 'fail',
        failureSummary: lastMeaningfulLine(failure.stderr, failure.stdout, ctx.check.name),
        artifacts: outputArtifacts(failure.stdout, failure.stderr),
      }
    }
  },
}

/** `npm run eval -- --suite $suite` with `{ suite: 'core-flows' }`. */
export function substitute(command: string, params: Params): string {
  return command.replace(/\$\{?(\w+)\}?/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

function outputArtifacts(stdout?: string, stderr?: string): RunArtifact[] {
  const artifacts: RunArtifact[] = []
  if (stdout?.trim()) {
    artifacts.push({
      id: newId(),
      name: 'stdout',
      kind: 'log',
      sizeBytes: stdout.length,
      preview: stdout.slice(-PREVIEW_CHARS),
    })
  }
  if (stderr?.trim()) {
    artifacts.push({
      id: newId(),
      name: 'stderr',
      kind: 'log',
      sizeBytes: stderr.length,
      preview: stderr.slice(-PREVIEW_CHARS),
    })
  }
  return artifacts
}

/**
 * One line, the one you actually need. Test runners put the useful part at the
 * end, so the last non-empty line beats the first — and beats a generic
 * "command failed with exit code 1".
 */
function lastMeaningfulLine(stderr = '', stdout = '', checkName = 'the check'): string {
  const lines = `${stderr}\n${stdout}`
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  return lines.at(-1) ?? `${checkName} failed with no output`
}
