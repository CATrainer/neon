/**
 * The forge seam.
 *
 * GitHub arrives after the bootstrap point, but the interface is here now so
 * nothing learns to read PR state out of a route handler. The local instance
 * runs against the stub with no GitHub connection at all — degraded on PR
 * state, fully functional on everything else.
 */
export interface PullRequestState {
  url: string
  number: number
  state: 'open' | 'merged' | 'closed'
  headSha: string
}

export interface CommitStatus {
  sha: string
  state: 'success' | 'failure' | 'pending'
  description: string
  targetUrl?: string
}

export interface GitHubProvider {
  readonly available: boolean
  /** Why it is unavailable, for a message a person can act on. */
  readonly unavailableReason: string | null
  pullRequestFor(repoRemote: string, branch: string): Promise<PullRequestState | null>
  postCommitStatus(repoRemote: string, status: CommitStatus): Promise<void>
}

export function createStubGitHubProvider(): GitHubProvider {
  return {
    available: false,
    unavailableReason:
      'no GitHub App is configured: PR state and commit statuses are unavailable, everything else works',
    async pullRequestFor() {
      return null
    },
    async postCommitStatus() {
      // Deliberately silent. Merge gating is what needs this, and merge gating
      // is not in this phase — failing here would block work for no benefit.
    },
  }
}
