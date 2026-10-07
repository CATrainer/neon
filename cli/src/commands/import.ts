import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { api, ApiError } from '../api.js'
import { remoteUrl, repoRoot } from '../git.js'

interface ImportReport {
  ideas: { title: string; outcome: string; id: string | null; priorRejections: string[] }[]
  decisions: { title: string; key: string | null; outcome: string; state: string }[]
  problems: string[]
}

/**
 * `neon import <file.md> [--as-recorded] [--dry-run]`
 *
 * Loads ideas (`neon capture "..."` lines) and decisions (records in the
 * knowledge/decisions format) from a markdown file — typically the output of
 * docs/chatgpt-export-prompt.md, pasted from a ChatGPT conversation. Decisions
 * arrive as `proposed` unless --as-recorded keeps each record's own state and
 * date, which is for records a person already accepted, like this repo's own.
 */
export async function importFile(args: string[]): Promise<void> {
  const files = args.filter((a) => !a.startsWith('--'))
  if (files.length === 0) {
    console.error('neon import <file.md> [more.md ...] [--as-recorded] [--dry-run]')
    process.exitCode = 1
    return
  }

  const root = repoRoot()
  let repoId: string | null = null
  const remote = remoteUrl()
  if (remote) {
    try {
      repoId = (await api<{ id: string }>('GET', `/api/repos/resolve?remote=${encodeURIComponent(remote)}`)).id
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
  }

  const dryRun = args.includes('--dry-run')
  for (const file of files) {
    const path = resolve(file)
    const inRepo = root ? relative(root, path).replace(/\\/g, '/') : null
    const report = await api<ImportReport>('POST', '/api/import', {
      text: readFileSync(path, 'utf8'),
      repoId,
      recordRef: inRepo && !inRepo.startsWith('..') ? inRepo : null,
      asRecorded: args.includes('--as-recorded'),
      dryRun,
    })

    console.log(`${file}${dryRun ? ' (dry run: nothing created)' : ''}`)
    for (const idea of report.ideas) {
      console.log(`  idea      ${idea.outcome.padEnd(12)} ${idea.id ?? ''} ${idea.title}`)
      for (const rejection of idea.priorRejections) console.log(`              already rejected — ${rejection}`)
    }
    for (const decision of report.decisions) {
      console.log(`  decision  ${decision.outcome.padEnd(12)} ${decision.key ?? '(new key)'} ${decision.state} ${decision.title}`)
    }
    for (const problem of report.problems) console.log(`  problem   ${problem}`)
  }
}
