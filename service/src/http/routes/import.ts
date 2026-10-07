import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { listComponents } from '../../domain/components.js'
import { createDecision, getDecision } from '../../domain/decisions.js'
import { DomainError } from '../../domain/errors.js'
import { captureIdea, listIdeas } from '../../domain/ideas.js'
import { parseImport } from '../../import/parse.js'
import type { Services } from '../../services.js'

const importBody = z.object({
  /** The file's text. The CLI reads it; the service never touches the disk. */
  text: z.string(),
  repoId: z.string().nullable().optional(),
  /** Where the file lives in the repo, if it does — recorded as the decision's
   *  reference into git. */
  recordRef: z.string().nullable().optional(),
  /** Keep each record's own state and date. Without it, every imported
   *  decision is `proposed`: generated material is a proposal for a person. */
  asRecorded: z.boolean().optional(),
  dryRun: z.boolean().optional(),
})

interface ImportReport {
  ideas: { title: string; outcome: 'created' | 'exists' | 'would create'; id: string | null; priorRejections: string[] }[]
  decisions: { title: string; key: string | null; outcome: 'created' | 'exists' | 'would create'; state: string }[]
  problems: string[]
}

/**
 * Imports ideas and decisions from markdown — a ChatGPT export, or a record
 * from knowledge/decisions — through the same domain functions as everything
 * else, so each one writes its event and passes the same gates. Re-importing
 * skips what is already there rather than duplicating it.
 */
export async function registerImportRoutes(app: FastifyInstance, _services: Services) {
  app.post('/api/import', async (request) => {
    const body = importBody.parse(request.body)
    const ctx = { ...request.neon, source: 'import' }
    const parsed = parseImport(body.text)
    const report: ImportReport = { ideas: [], decisions: [], problems: [...parsed.problems] }

    const components = body.repoId ? await listComponents(ctx.db, body.repoId) : []
    const componentId = new Map(components.map((c) => [c.name.toLowerCase(), c.id]))

    const known = new Set(
      [...(await listIdeas(ctx.db, { state: 'open', limit: 500 })), ...(await listIdeas(ctx.db, { state: 'promoted', limit: 500 }))].map(
        (idea) => idea.title.trim().toLowerCase(),
      ),
    )

    for (const idea of parsed.ideas) {
      if (known.has(idea.title.toLowerCase())) {
        report.ideas.push({ title: idea.title, outcome: 'exists', id: null, priorRejections: [] })
        continue
      }
      if (body.dryRun) {
        report.ideas.push({ title: idea.title, outcome: 'would create', id: null, priorRejections: [] })
        continue
      }
      const result = await captureIdea(ctx, {
        title: idea.title,
        body: idea.body,
        source: 'chat',
        repoId: body.repoId ?? null,
      })
      known.add(idea.title.toLowerCase())
      report.ideas.push({
        title: idea.title,
        outcome: 'created',
        id: result.idea.id,
        priorRejections: result.priorRejections.map((r) => `${r.decisionKey}: ${r.alternative} — ${r.why}`),
      })
    }

    for (const decision of parsed.decisions) {
      if (decision.key && (await exists(ctx.db, decision.key))) {
        report.decisions.push({ title: decision.title, key: decision.key, outcome: 'exists', state: '' })
        continue
      }

      const ids: string[] = []
      for (const name of decision.components) {
        const id = componentId.get(name.toLowerCase())
        if (id) ids.push(id)
        else report.problems.push(`"${decision.title}": component "${name}" is not declared on this repo, so it is not linked`)
      }

      const state = body.asRecorded ? decision.state : 'proposed'
      if (body.dryRun) {
        report.decisions.push({ title: decision.title, key: decision.key, outcome: 'would create', state })
        continue
      }
      const created = await createDecision(ctx, {
        title: decision.title,
        rationale: decision.rationale,
        rejectedAlternatives: decision.rejectedAlternatives,
        componentIds: ids,
        state,
        key: decision.key ?? undefined,
        decidedAt: body.asRecorded ? decision.decidedAt : null,
        recordRef: body.recordRef ?? null,
        recordContentHash: decision.contentHash,
      })
      report.decisions.push({ title: created.title, key: created.key, outcome: 'created', state: created.state })
    }

    return report
  })
}

async function exists(db: Parameters<typeof getDecision>[0], key: string): Promise<boolean> {
  try {
    await getDecision(db, key)
    return true
  } catch (err) {
    if (err instanceof DomainError && err.code === 'not_found') return false
    throw err
  }
}
