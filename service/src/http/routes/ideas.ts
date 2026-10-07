import { doneWhenClause, ideaSource, ideaState, workOrderKind } from '@neon/core'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  captureIdea,
  discardIdea,
  expireIdeas,
  getIdea,
  listIdeas,
  touchIdea,
} from '../../domain/ideas.js'
import { promoteIdea } from '../../domain/workOrders.js'
import type { Services } from '../../services.js'

/**
 * Capture takes a title and, optionally, a body. Nothing else is required and
 * nothing else ever should be: the moment this endpoint demands a component or
 * a repo, people stop using it and the funnel is a write-only log.
 */
const captureBody = z.object({
  title: z.string().min(1),
  body: z.string().optional(),
  source: ideaSource.optional(),
  tags: z.array(z.string()).optional(),
  repoId: z.string().nullable().optional(),
  id: z.string().optional(),
})

const promoteBody = z.object({
  kind: workOrderKind,
  title: z.string().optional(),
  intent: z.string(),
  acceptanceCriteria: z.array(z.string()),
  doneWhen: z.array(doneWhenClause).optional(),
  declaredComponentIds: z.array(z.string()).optional(),
  repoId: z.string().nullable().optional(),
  state: z.enum(['draft', 'ready']).optional(),
})

export async function registerIdeaRoutes(app: FastifyInstance, _services: Services) {
  app.post('/api/ideas', async (request, reply) => {
    const body = captureBody.parse(request.body)
    const result = await captureIdea(request.neon, body)
    // Matches come back in the same response, synchronously. Either the person
    // stops, or they now know exactly why the previous version failed.
    return reply.status(201).send(result)
  })

  app.get('/api/ideas', async (request) => {
    const { state, limit } = z
      .object({ state: ideaState.optional(), limit: z.coerce.number().optional() })
      .parse(request.query)
    return { ideas: await listIdeas(request.neon.db, { state, limit }) }
  })

  app.get('/api/ideas/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    return getIdea(request.neon.db, id)
  })

  app.post('/api/ideas/:id/touch', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    return touchIdea(request.neon, id)
  })

  app.post('/api/ideas/:id/discard', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    return discardIdea(request.neon, id)
  })

  app.post('/api/ideas/:id/promote', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = promoteBody.parse(request.body)
    const workOrder = await promoteIdea(request.neon, id, {
      ...body,
      title: body.title ?? '',
    })
    return reply.status(201).send(workOrder)
  })

  /** Expiry is silent and needs no queue. This exists so a scheduler can call
   *  it; nothing else depends on it having run. */
  app.post('/api/maintenance/expire-ideas', async (request) => {
    const expired = await expireIdeas(request.neon.db)
    return { expired }
  })
}
