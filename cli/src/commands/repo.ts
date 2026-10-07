import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { api } from '../api.js'
import { valueOf } from './check.js'
import { currentBranch, originDefaultBranch, remoteUrl, repoRoot } from '../git.js'

/** Registration is thin on purpose: a remote, a kind, done. */
export async function registerRepo(args: string[]): Promise<void> {
  if (args[0] !== 'register') {
    console.error('neon repo register [--kind code|knowledge|config] [--prefix ABC] [--default-branch main]')
    process.exitCode = 1
    return
  }

  const remote = remoteUrl()
  const root = repoRoot()
  if (!remote || !root) {
    console.error('not inside a git repository with an origin remote')
    process.exitCode = 1
    return
  }

  const repo = await api<{ id: string; name: string; kind: string; keyPrefix: string }>(
    'POST',
    '/api/repos',
    {
      name: basename(root),
      remoteUrl: remote,
      kind: valueOf(args, '--kind') ?? 'code',
      // Not simply the current branch: registering from a feature branch would
      // make that branch the base every reconcile diffs against.
      defaultBranch:
        valueOf(args, '--default-branch') ?? originDefaultBranch() ?? currentBranch() ?? 'main',
      localPath: root,
      keyPrefix: valueOf(args, '--prefix'),
    },
  )

  console.log(`registered ${repo.name} as ${repo.kind}, keys ${repo.keyPrefix}-n`)
  console.log('declare its checks in neon.checks.yaml, then: neon checks sync')
}

/**
 * Checks are declared by the repo, not configured in the service. Syncing the
 * file is what keeps a new kind of evidence from needing a schema change.
 */
export async function syncChecks(args: string[]): Promise<void> {
  if (args[0] !== 'sync') {
    console.error('neon checks sync [path/to/neon.checks.yaml]')
    process.exitCode = 1
    return
  }

  const root = repoRoot()
  const path = args[1] ?? join(root ?? '.', 'neon.checks.yaml')
  const remote = remoteUrl()
  if (!remote) {
    console.error('not inside a git repository with an origin remote')
    process.exitCode = 1
    return
  }

  const repo = await api<{ id: string }>(
    'GET',
    `/api/repos/resolve?remote=${encodeURIComponent(remote)}`,
  )

  let yaml: string
  try {
    yaml = readFileSync(path, 'utf8')
  } catch {
    console.error(`no check declarations at ${path}`)
    process.exitCode = 1
    return
  }

  const result = await api<{ checks: { name: string; kind: string }[] }>(
    'POST',
    `/api/repos/${repo.id}/checks`,
    { yaml },
  )
  for (const check of result.checks) {
    console.log(`${check.kind.padEnd(8)} ${check.name}`)
  }
}
