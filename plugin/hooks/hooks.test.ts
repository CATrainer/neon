import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The hooks as Claude Code runs them: a separate process, JSON on stdin, and
 * nothing but the exit code and the output to say what happened. They are
 * dependency-free JavaScript, so they are tested from the outside rather than
 * imported.
 */
const HOOKS = dirname(fileURLToPath(import.meta.url))

interface HookResult {
  code: number | null
  stdout: string
  stderr: string
}

function runHook(
  name: string,
  input: Record<string, unknown>,
  env: Record<string, string | undefined> = {},
): Promise<HookResult> {
  const base = { ...process.env }
  // The suite must not inherit an override from whoever runs it.
  delete base.NEON_SKIP_CHECKS
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(HOOKS, `${name}.mjs`)], {
      env: { ...base, NEON_URL: neon.url, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(JSON.stringify(input))
  })
}

const decisionOf = (result: HookResult) => {
  if (result.stdout.trim() === '') return 'allow'
  return (JSON.parse(result.stdout) as { hookSpecificOutput: { permissionDecision: string } })
    .hookSpecificOutput.permissionDecision
}

// -- A checkout to run in ----------------------------------------------------

const REMOTE = 'https://github.com/example/hooked'
const BRANCH = 'neon/work/hk-1-hooked'

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'neon-hooks-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  git('init', '-q')
  git('remote', 'add', 'origin', REMOTE)
  git('-c', 'user.email=hooks@test', '-c', 'user.name=hooks', 'commit', '-q', '--allow-empty', '-m', 'init')
  git('checkout', '-q', '-b', BRANCH)
  writeFileSync(
    join(root, 'neon.yaml'),
    ['protected_paths:', '  - "infra/**"', '  - "service/src/db/migrations/**"', ''].join('\n'),
  )
  return root
}

// -- A stand-in for the Neon service -----------------------------------------

interface CheckResult {
  check: string
  result: 'pass' | 'fail' | 'error'
  runId: string | null
  failureSummary: string | null
  thresholdViolation: string | null
}

interface FakeNeon {
  url: string
  /** What the next check call reports. */
  results: CheckResult[]
  /** Whether this checkout's branch has live claimed work. */
  claimed: boolean
  checkCalls: number
  server: Server
}

const neon: FakeNeon = {
  url: '',
  results: [],
  claimed: true,
  checkCalls: 0,
  server: createServer((req, res) => route(req, res)),
}

const REPO = { id: 'repo-1', name: 'hooked', kind: 'code', defaultBranch: 'main' }
const CHANGE = { id: 'chg-1', workOrderId: 'wo-1', branch: BRANCH, state: 'claimed', specRef: null }
const WORK_ORDER = { id: 'wo-1', key: 'HK-1', title: 'Hooked', state: 'in_progress', doneWhen: [{ check: 'tests' }] }

function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://fake')
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname === '/api/repos/resolve') {
    return url.searchParams.get('remote') === REMOTE
      ? send(200, REPO)
      : send(404, { error: 'not_found', message: 'repo not found' })
  }
  if (url.pathname === '/api/changes') {
    return send(200, { changes: neon.claimed ? [CHANGE] : [] })
  }
  if (url.pathname === `/api/work-orders/${WORK_ORDER.id}`) return send(200, WORK_ORDER)
  if (url.pathname === `/api/changes/${CHANGE.id}/check` && req.method === 'POST') {
    neon.checkCalls += 1
    return send(200, {
      changeId: CHANGE.id,
      workOrderKey: WORK_ORDER.key,
      passed: neon.results.every((r) => r.result === 'pass' && !r.thresholdViolation),
      results: neon.results,
    })
  }
  return send(404, { error: 'not_found', message: `no fake for ${url.pathname}` })
}

const failing: CheckResult[] = [
  { check: 'tests', result: 'fail', runId: 'run-1', failureSummary: '2 tests failed', thresholdViolation: null },
]

let repo: string

beforeAll(async () => {
  await new Promise<void>((resolve) => neon.server.listen(0, '127.0.0.1', resolve))
  neon.url = `http://127.0.0.1:${(neon.server.address() as AddressInfo).port}`
  repo = makeRepo()
})

afterAll(async () => {
  await new Promise((resolve) => neon.server.close(resolve))
})

// -- PreToolUse ---------------------------------------------------------------

const edit = (path: string) => ({ tool_name: 'Edit', cwd: repo, tool_input: { file_path: join(repo, path) } })
const bash = (command: string) => ({ tool_name: 'Bash', cwd: repo, tool_input: { command } })

describe('PreToolUse on file edits', () => {
  it('denies a path the repo protects in neon.yaml', async () => {
    const result = await runHook('pre-tool-use', edit('service/src/db/migrations/0003_x.sql'))
    expect(result.code).toBe(0)
    expect(decisionOf(result)).toBe('deny')
    expect(result.stdout).toMatch(/neon\.yaml: service\/src\/db\/migrations/)
  })

  it('allows a path nothing protects', async () => {
    const result = await runHook('pre-tool-use', edit('service/src/config.ts'))
    expect(result.code).toBe(0)
    expect(decisionOf(result)).toBe('allow')
  })

  it('denies .neon/ in every repo, even one whose neon.yaml does not list it', async () => {
    const result = await runHook('pre-tool-use', edit('.neon/skip-checks'))
    expect(decisionOf(result)).toBe('deny')
    expect(result.stdout).toMatch(/protected in every repo/)
  })

  it('denies the settings files that can set environment variables or disable hooks', async () => {
    expect(decisionOf(await runHook('pre-tool-use', edit('.claude/settings.local.json')))).toBe('deny')
    expect(decisionOf(await runHook('pre-tool-use', edit('.claude/settings.json')))).toBe('deny')
    const user = { tool_name: 'Write', cwd: repo, tool_input: { file_path: join(homedir(), '.claude', 'settings.json') } }
    expect(decisionOf(await runHook('pre-tool-use', user))).toBe('deny')
  })

  it('stands aside outside a git repository', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'neon-nogit-'))
    const result = await runHook('pre-tool-use', {
      tool_name: 'Edit',
      cwd: outside,
      tool_input: { file_path: join(outside, 'infra', 'x.yml') },
    })
    expect(result.code).toBe(0)
    expect(decisionOf(result)).toBe('allow')
  })
})

describe('PreToolUse on shell commands', () => {
  it.each([
    'touch .neon/skip-checks',
    'mkdir -p .neon && echo 1 > .neon/skip-checks',
    'echo 1 >.neon/skip-checks',
    'cp /tmp/x ./.neon/skip-checks',
    'New-Item -ItemType File .neon\\skip-checks',
    'node -e "require(\'fs\').writeFileSync(\'.neon/skip-checks\', \'\')"',
    'echo \'{"env":{"NEON_SKIP_CHECKS":"1"}}\' > .claude/settings.local.json',
  ])('denies %s', async (command) => {
    const result = await runHook('pre-tool-use', bash(command))
    expect(result.code).toBe(0)
    expect(decisionOf(result)).toBe('deny')
  })

  it.each(['npm test', 'git status', 'cat neon.yaml', 'node cli/bin/neon.js check', 'ls services/.neonrc'])(
    'allows %s',
    async (command) => {
      const result = await runHook('pre-tool-use', bash(command))
      expect(decisionOf(result)).toBe('allow')
    },
  )
})

// -- Stop ---------------------------------------------------------------------

const stop = (extra: Record<string, unknown> = {}) => ({ session_id: randomUUID(), cwd: repo, ...extra })

describe('the Stop hook override', () => {
  it('blocks when the definition of done fails', async () => {
    neon.results = failing
    const result = await runHook('stop', stop())
    expect(result.code).toBe(2)
    expect(result.stderr).toMatch(/HK-1 is not done/)
    expect(result.stderr).toMatch(/2 tests failed/)
  })

  it('no longer honours a .neon/skip-checks file', async () => {
    neon.results = failing
    mkdirSync(join(repo, '.neon'), { recursive: true })
    writeFileSync(join(repo, '.neon', 'skip-checks'), '')
    const result = await runHook('stop', stop())
    expect(result.code).toBe(2)
  })

  it('stands aside when the session was launched with NEON_SKIP_CHECKS=1', async () => {
    neon.results = failing
    const calls = neon.checkCalls
    const result = await runHook('stop', stop(), { NEON_SKIP_CHECKS: '1' })
    expect(result.code).toBe(0)
    expect(result.stderr).toMatch(/NEON_SKIP_CHECKS=1/)
    // Skipped means not run, not run-and-ignored.
    expect(neon.checkCalls).toBe(calls)
  })
})
