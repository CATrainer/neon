import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Shared helpers for the hooks.
 *
 * Plain JavaScript with no dependencies on purpose: hooks run on every session
 * start and every edit, in whatever environment the developer has, and a hook
 * that needs an install step is a hook that silently stops running.
 */

export const baseUrl = () => (process.env.NEON_URL ?? 'http://localhost:4000').replace(/\/+$/, '')

export async function readInput() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  return raw ? JSON.parse(raw) : {}
}

export function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
  } catch {
    return null
  }
}

export async function api(path, options = {}) {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-neon-source': 'hook' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) {
    const error = new Error(payload.message ?? response.statusText)
    error.status = response.status
    throw error
  }
  return payload
}

/**
 * The repo, branch and live change for a working directory — or nulls. Every
 * hook here treats "cannot tell" as "do nothing": a verification system that
 * blocks people when it is confused gets uninstalled.
 */
export async function session(cwd) {
  const root = git(['rev-parse', '--show-toplevel'], cwd)
  const remote = git(['remote', 'get-url', 'origin'], cwd)
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  if (!root || !remote) return { root, remote, branch, repo: null, change: null, workOrder: null }

  let repo = null
  try {
    repo = await api(`/api/repos/resolve?remote=${encodeURIComponent(remote)}`)
  } catch {
    return { root, remote, branch, repo: null, change: null, workOrder: null }
  }

  const { changes } = await api(`/api/changes?repoId=${repo.id}`)
  const change =
    changes.find(
      (c) => c.branch === branch && !['merged', 'closed', 'abandoned'].includes(c.state),
    ) ?? null

  let workOrder = null
  if (change) workOrder = await api(`/api/work-orders/${change.workOrderId}`)

  return { root, remote, branch, repo, change, workOrder }
}

/**
 * Per-repo configuration for the hooks: which paths are protected, what to run
 * after an edit. Absent means "no opinion", not "block everything".
 */
export function repoConfig(root) {
  if (!root) return {}
  const path = join(root, 'neon.yaml')
  if (!existsSync(path)) return {}
  return parseSimpleYaml(readFileSync(path, 'utf8'))
}

/**
 * A deliberately small YAML reader: string values, and lists of strings under a
 * key. Pulling in a parser would mean the hooks need an install step, and the
 * config this reads is five lines long.
 */
export function parseSimpleYaml(text) {
  const result = {}
  let key = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trimEnd()
    if (line.trim() === '') continue

    // Whether a key holds a list or an object is decided by what follows it.
    const listItem = /^\s+-\s+(.*)$/.exec(line)
    if (listItem && key) {
      if (!Array.isArray(result[key])) result[key] = []
      result[key].push(unquote(listItem[1]))
      continue
    }

    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(line)
    if (nested && key) {
      if (Array.isArray(result[key]) || typeof result[key] !== 'object' || result[key] === null) {
        result[key] = {}
      }
      result[key][nested[1]] = unquote(nested[2])
      continue
    }

    const top = /^([\w-]+):\s*(.*)$/.exec(line)
    if (top) {
      key = top[1]
      result[key] = top[2] === '' ? null : unquote(top[2])
      if (top[2] !== '') key = null
    }
  }

  for (const [name, value] of Object.entries(result)) {
    if (value === null) result[name] = {}
  }
  return result
}

function unquote(value) {
  return value.trim().replace(/^["']|["']$/g, '')
}

/**
 * Paths protected in every repo, whatever its neon.yaml says. `.neon/` is
 * Neon's own per-checkout state, and Claude Code's settings files can set
 * environment variables or disable hooks outright — the agent being held to a
 * bar must not be able to edit the things that decide whether the bar applies.
 */
export const BUILT_IN_PROTECTED = ['.neon/**', '.claude/settings.json', '.claude/settings.local.json']

/** The user-level settings files, which live outside any repo. */
export function isUserSettingsFile(path, home = homedir()) {
  const target = normaliseForCompare(resolve(path))
  return ['settings.json', 'settings.local.json'].some(
    (name) => normaliseForCompare(join(home, '.claude', name)) === target,
  )
}

function normaliseForCompare(path) {
  const forward = path.replace(/\\/g, '/')
  return process.platform === 'win32' ? forward.toLowerCase() : forward
}

/**
 * Whether a shell command names a protected location, and which. Deliberately
 * blunt: it matches any mention, reads included, because telling a write from a
 * read in an arbitrary shell string is not something a regex can do (redirects,
 * tee, cp, node -e, python -c, PowerShell cmdlets...), and an agent has no
 * reason to touch these at all. It is a tripwire, not a sandbox: a command built
 * to evade it will evade it.
 */
export function shellNamesProtectedPath(command) {
  if (typeof command !== 'string' || command === '') return null
  if (/(^|[\s"'=:(<>|;&/\\`])\.neon([/\\\s"';|&)<>`]|$)/.test(command)) return '.neon/'
  if (/\.claude[/\\]settings(\.local)?\.json/i.test(command)) return '.claude/settings*.json'
  return null
}

/** Glob matching good enough for path prefixes: `src/api/**`, `*.env`. */
export function matchesGlob(path, glob) {
  const normalised = path.replace(/\\/g, '/')
  // `**` is held aside as a sentinel so the single-star rule cannot eat it.
  const SENTINEL = '\u0000'
  const pattern = glob
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    .replace(/\*\*/g, SENTINEL)
    .replace(/\*/g, '[^/]*')
    .split(SENTINEL)
    .join('.*')
  return new RegExp(`^${pattern}$`).test(normalised)
}