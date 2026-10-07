import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

function makeRepo(remote = REMOTE): string {
  const root = mkdtempSync(join(tmpdir(), 'neon-hooks-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  git('init', '-q')
  git('remote', 'add', 'origin', remote)
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
  /** Set to make the check endpoint fail outright. */
  checkStatus: number
  /** Set to report a definition of done with nothing in it. */
  problem: string | null
  checkCalls: number
  server: Server
}

const neon: FakeNeon = {
  url: '',
  results: [],
  claimed: true,
  checkStatus: 200,
  problem: null,
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
  // Only the active-change lookup is answered: listing /api/changes saw just
  // the 100 newest, and the hooks must not depend on it.
  if (url.pathname === '/api/changes/active') {
    const live =
      neon.claimed &&
      url.searchParams.get('repoId') === REPO.id &&
      url.searchParams.get('branch') === BRANCH
    return send(200, live ? { change: CHANGE, workOrder: WORK_ORDER } : { change: null, workOrder: null })
  }
  if (url.pathname === `/api/changes/${CHANGE.id}/check` && req.method === 'POST') {
    neon.checkCalls += 1
    if (neon.checkStatus !== 200) return send(neon.checkStatus, { error: 'internal', message: 'boom' })
    if (neon.problem) {
      return send(200, { changeId: CHANGE.id, workOrderKey: WORK_ORDER.key, passed: false, results: [], problem: neon.problem })
    }
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
const passing: CheckResult[] = [
  { check: 'tests', result: 'pass', runId: 'run-2', failureSummary: null, thresholdViolation: null },
]

/** Every test starts from a claimed change and a healthy service. */
function resetNeon() {
  neon.results = failing
  neon.claimed = true
  neon.checkStatus = 200
  neon.problem = null
}

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

describe('the Stop hook, every other path', () => {
  beforeEach(resetNeon)

  it('lets the agent stop when the definition of done passes', async () => {
    neon.results = passing
    const result = await runHook('stop', stop())
    expect(result.code).toBe(0)
  })

  it('stands aside for a repo Neon does not know', async () => {
    const elsewhere = makeRepo('https://github.com/example/unregistered')
    const calls = neon.checkCalls
    const result = await runHook('stop', stop({ cwd: elsewhere }))
    expect(result.code).toBe(0)
    expect(neon.checkCalls).toBe(calls)
  })

  it('stands aside when nothing is claimed on this branch', async () => {
    neon.claimed = false
    const calls = neon.checkCalls
    const result = await runHook('stop', stop())
    expect(result.code).toBe(0)
    expect(neon.checkCalls).toBe(calls)
  })

  it('stands aside when Neon is unreachable: being down blocks merges, not work', async () => {
    const result = await runHook('stop', stop(), { NEON_URL: 'http://127.0.0.1:1' })
    expect(result.code).toBe(0)
  })

  it('stands aside, and says so, when the check call itself fails', async () => {
    neon.checkStatus = 500
    const result = await runHook('stop', stop())
    expect(result.code).toBe(0)
    expect(result.stderr).toMatch(/could not run checks .* not blocking/)
  })

  it('keeps blocking within one turn while the checks still fail, up to the ceiling', async () => {
    // Claude Code sets stop_hook_active once the agent is continuing because a
    // stop hook blocked. Standing aside on it made the gate one-shot: the
    // agent's second attempt to stop in the same turn always succeeded.
    const session = stop()
    const first = await runHook('stop', session)
    expect(first.code).toBe(2)

    const calls = neon.checkCalls
    const again = await runHook('stop', { ...session, stop_hook_active: true })
    expect(again.code).toBe(2)
    expect(neon.checkCalls).toBe(calls + 1)

    expect((await runHook('stop', { ...session, stop_hook_active: true })).code).toBe(2)
    const gaveUp = await runHook('stop', { ...session, stop_hook_active: true })
    expect(gaveUp.code).toBe(0)
    expect(gaveUp.stderr).toMatch(/still fails its checks after 3 attempts/)
  })

  it('lets the agent stop mid-turn once the checks pass', async () => {
    const session = stop()
    expect((await runHook('stop', session)).code).toBe(2)
    neon.results = passing
    expect((await runHook('stop', { ...session, stop_hook_active: true })).code).toBe(0)
  })

  it('reports an empty definition of done without blocking on it', async () => {
    neon.problem = 'work order HK-1 has an empty done_when: there is nothing to check'
    const result = await runHook('stop', stop())
    expect(result.code).toBe(0)
    expect(result.stderr).toMatch(/empty done_when/)
  })

  it('stops blocking after three consecutive blocks, and says why', async () => {
    const session = stop()
    const codes: (number | null)[] = []
    for (let i = 0; i < 4; i += 1) codes.push((await runHook('stop', session)).code)
    expect(codes).toEqual([2, 2, 2, 0])
  })

  it('starts counting again after the checks pass', async () => {
    const session = stop()
    expect((await runHook('stop', session)).code).toBe(2)
    expect((await runHook('stop', session)).code).toBe(2)
    neon.results = passing
    expect((await runHook('stop', session)).code).toBe(0)
    neon.results = failing
    expect((await runHook('stop', session)).code).toBe(2)
    expect((await runHook('stop', session)).code).toBe(2)
    expect((await runHook('stop', session)).code).toBe(2)
  })
})

// -- SessionStart ----------------------------------------------------------------

describe('SessionStart', () => {
  beforeEach(resetNeon)

  it('announces claimed work and its definition of done', async () => {
    const result = await runHook('session-start', { cwd: repo })
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/claimed for HK-1/)
    expect(result.stdout).toMatch(/Definition of done: tests/)
  })

  it('says when the repo is registered but nothing is claimed', async () => {
    neon.claimed = false
    const result = await runHook('session-start', { cwd: repo })
    expect(result.stdout).toMatch(/no work is claimed on neon\/work\/hk-1-hooked/)
  })

  it('says nothing about a repo Neon does not know', async () => {
    const elsewhere = makeRepo('https://github.com/example/unregistered')
    const result = await runHook('session-start', { cwd: elsewhere })
    expect(result.code).toBe(0)
    expect(result.stdout).toBe('')
  })
})

// -- PostToolUse -----------------------------------------------------------------

describe('PostToolUse', () => {
  it('runs the formatter on the edited file, and never blocks on a failing lint', async () => {
    const root = makeRepo()
    // Commands as files: the hooks' YAML reader is deliberately minimal and
    // strips the quotes an inline `node -e "..."` would need.
    writeFileSync(
      join(root, 'fmt.mjs'),
      "import { writeFileSync } from 'node:fs'\nwriteFileSync('formatted.txt', process.argv[2])\n",
    )
    writeFileSync(join(root, 'lint.mjs'), "console.error('lint: 1 problem in src/a.ts')\nprocess.exit(1)\n")
    writeFileSync(
      join(root, 'neon.yaml'),
      ['format:', '  command: node fmt.mjs', 'lint:', '  command: node lint.mjs', ''].join('\n'),
    )

    const result = await runHook('post-tool-use', {
      tool_name: 'Edit',
      cwd: root,
      tool_input: { file_path: join(root, 'src', 'a.ts') },
    })
    expect(result.code).toBe(0)
    expect(readFileSync(join(root, 'formatted.txt'), 'utf8')).toBe('src/a.ts')
    expect(result.stderr).toMatch(/lint: 1 problem in src\/a\.ts/)
  })
})

describe('PostToolUse and hostile file names', () => {
  it('does not let a file name smuggle a second command into the formatter call', async () => {
    const root = makeRepo()
    writeFileSync(
      join(root, 'fmt.mjs'),
      "import { writeFileSync } from 'node:fs'\nwriteFileSync('formatted.txt', process.argv[2] ?? '')\n",
    )
    writeFileSync(join(root, 'pwn.mjs'), "import { writeFileSync } from 'node:fs'\nwriteFileSync('pwned.txt', 'x')\n")
    writeFileSync(join(root, 'neon.yaml'), ['format:', '  command: node fmt.mjs', ''].join('\n'))

    // `&` separates commands in both sh and cmd.exe; the quote closes the one
    // the hook wraps the path in.
    const hostile = join(root, 'src', 'a" & node pwn.mjs & ".ts')
    const result = await runHook('post-tool-use', {
      tool_name: 'Write',
      cwd: root,
      tool_input: { file_path: hostile },
    })

    expect(result.code).toBe(0)
    expect(existsSync(join(root, 'pwned.txt'))).toBe(false)
    expect(existsSync(join(root, 'formatted.txt'))).toBe(false)
    expect(result.stderr).toMatch(/not formatting/)
  })

  it('still formats ordinary names, spaces included', async () => {
    const root = makeRepo()
    writeFileSync(
      join(root, 'fmt.mjs'),
      "import { writeFileSync } from 'node:fs'\nwriteFileSync('formatted.txt', process.argv[2] ?? '')\n",
    )
    writeFileSync(join(root, 'neon.yaml'), ['format:', '  command: node fmt.mjs', ''].join('\n'))
    await runHook('post-tool-use', {
      tool_name: 'Edit',
      cwd: root,
      tool_input: { file_path: join(root, 'docs', 'release notes (v2).md') },
    })
    expect(readFileSync(join(root, 'formatted.txt'), 'utf8')).toBe('docs/release notes (v2).md')
  })
})
