import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getRepo } from '../../domain/repos.js'
import { recordEvent } from '../../domain/events.js'
import { planRules, recordApplied } from '../../rules/generate.js'
import type { Services } from '../../services.js'

const appliedBody = z.object({
  applied: z.array(
    z.object({
      decisionId: z.string(),
      componentId: z.string().nullable(),
      path: z.string(),
      globs: z.array(z.string()),
      contentHash: z.string(),
      state: z.enum(['proposed', 'applied', 'removed']),
    }),
  ),
})

export async function registerRuleRoutes(app: FastifyInstance, _services: Services) {
  /** The plan is the product. Nothing is written by asking for it. */
  app.get('/api/repos/:id/rules/plan', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const repo = await getRepo(request.neon.db, id)
    return { repo: repo.name, plan: await planRules(request.neon.db, repo.id) }
  })

  /**
   * Records what a human applied. Neon holds the hash so drift can be detected;
   * the repo holds the text, and this endpoint never writes to it.
   */
  app.post('/api/repos/:id/rules/applied', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const repo = await getRepo(request.neon.db, id)
    const { applied } = appliedBody.parse(request.body)

    await recordApplied(request.neon.db, repo.id, applied)
    await recordEvent(request.neon.db, {
      kind: 'rules.applied',
      subjectType: 'repo',
      subjectId: repo.id,
      actorId: request.neon.actorId,
      source: request.neon.source ?? 'api',
      payload: { paths: applied.map((rule) => rule.path) },
    })

    return { recorded: applied.length }
  })
}
