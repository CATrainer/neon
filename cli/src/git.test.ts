import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { originDefaultBranch } from './git.js'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'ignore' })

/** An upstream whose default branch is `main`, holding one commit. */
function upstream(): string {
  const dir = mkdtempSync(join(tmpdir(), 'neon-upstream-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'init')
  return dir
}

describe('the default branch of a repo', () => {
  it('comes from origin/HEAD, not from whatever is checked out', () => {
    const origin = upstream()
    const clone = mkdtempSync(join(tmpdir(), 'neon-clone-'))
    git(clone, 'clone', '-q', origin, '.')
    git(clone, 'checkout', '-q', '-b', 'demo-prep')

    expect(originDefaultBranch(clone)).toBe('main')
  })

  it('is unknown for a repo that was pushed rather than cloned', () => {
    // No clone ever ran, so git never recorded origin/HEAD; the caller falls
    // back to the current branch.
    const repo = upstream()
    git(repo, 'remote', 'add', 'origin', 'https://github.com/example/pushed')
    expect(originDefaultBranch(repo)).toBeNull()
  })
})
