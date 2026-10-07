import { execFileSync } from 'node:child_process'

/**
 * Git answers for itself. Neon never mirrors branch names, commit metadata or
 * remotes — it asks, here, at the moment it needs them.
 */
function git(args: string[], cwd = process.cwd()): string | null {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

export const remoteUrl = (cwd?: string) => git(['remote', 'get-url', 'origin'], cwd)
export const currentBranch = (cwd?: string) => git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
export const headSha = (cwd?: string) => git(['rev-parse', 'HEAD'], cwd)
export const repoRoot = (cwd?: string) => git(['rev-parse', '--show-toplevel'], cwd)

/** Commits in a range, with their subject and whether they carry a work order
 *  trailer. This is what reconciliation reads. */
export interface CommitSummary {
  sha: string
  subject: string
  workOrderKey: string | null
}

const RECORD_SEPARATOR = '\u001e'
const UNIT_SEPARATOR = '\u001f'

export function commitsSince(ref: string, cwd?: string): CommitSummary[] {
  // Separators rather than newlines: a commit body contains newlines, and the
  // trailer we are looking for lives in one.
  const raw = git(['log', `${ref}..HEAD`, '--format=%H%x1f%s%x1f%b%x1e'], cwd)
  if (!raw) return []
  return raw
    .split(RECORD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha = '', subject = '', body = ''] = entry.split(UNIT_SEPARATOR)
      const trailer = /^Neon-Work-Order:\s*(\S+)/m.exec(body)
      return { sha, subject, workOrderKey: trailer?.[1] ?? null }
    })
}

export function changedFiles(ref: string, cwd?: string): string[] {
  const raw = git(['diff', '--name-only', `${ref}...HEAD`], cwd)
  return raw ? raw.split('\n').filter(Boolean) : []
}
