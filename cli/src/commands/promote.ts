import { readFileSync } from 'node:fs'
import { api } from '../api.js'
import { valueOf } from './check.js'

/**
 * Promotion is the ladder's second gate, and it is a human act: the intent and
 * the acceptance criteria are drafted by whoever is promoting (usually with an
 * agent's help) and passed in as a file they can read before it happens.
 *
 * This is not on the MCP surface on purpose. The tool set stays small and
 * fixed, and an agent that can promote its own ideas without a person reading
 * the draft is a funnel with no gate in it.
 */
export async function promote(args: string[]): Promise<void> {
  const [ideaId] = args
  if (!ideaId || ideaId.startsWith('--')) {
    console.error('neon promote <idea-id> --file draft.json   (or pipe the draft on stdin)')
    console.error(
      '\ndraft.json: { "kind": "code|inquiry", "intent": "...", "acceptanceCriteria": ["..."], "doneWhen": [{"check":"..."}], "repoId": "...", "state": "draft|ready" }',
    )
    process.exitCode = 1
    return
  }

  const file = valueOf(args, '--file')
  const raw = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8')
  const draft = JSON.parse(raw) as Record<string, unknown>

  const workOrder = await api<{ key: string; state: string; title: string }>(
    'POST',
    `/api/ideas/${ideaId}/promote`,
    draft,
  )

  console.log(`${workOrder.key}  ${workOrder.state}  ${workOrder.title}`)
  if (workOrder.state === 'draft') {
    console.log('still a draft: it needs an executable done_when before anyone can claim it.')
  }
}
