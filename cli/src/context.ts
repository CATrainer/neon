import { api, ApiError } from './api.js'
import { currentBranch, remoteUrl, repoRoot } from './git.js'

/**
 * Where the CLI is running: which registered repo, which branch, and whether
 * there is live work here. Every command that needs any of this asks git first
 * and Neon second.
 */
export interface SessionContext {
  root: string | null
  remote: string | null
  branch: string | null
  repo: { id: string; name: string; kind: string; defaultBranch: string } | null
  change: {
    id: string
    workOrderId: string
    branch: string
    state: string
    specRef: string | null
  } | null
  workOrder: { key: string; title: string; kind: string; state: string } | null
}

export async function resolveSession(): Promise<SessionContext> {
  const root = repoRoot()
  const remote = remoteUrl()
  const branch = currentBranch()

  const context: SessionContext = {
    root,
    remote,
    branch,
    repo: null,
    change: null,
    workOrder: null,
  }
  if (!remote) return context

  try {
    context.repo = await api(`GET`, `/api/repos/resolve?remote=${encodeURIComponent(remote)}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return context
    throw err
  }

  if (!branch) return context
  const active = await api<{
    change: SessionContext['change']
    workOrder: SessionContext['workOrder']
  }>(
    'GET',
    `/api/changes/active?repoId=${encodeURIComponent(context.repo!.id)}&branch=${encodeURIComponent(branch)}`,
  )
  context.change = active.change
  context.workOrder = active.workOrder
  return context
}
