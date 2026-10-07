import { doneWhenClause, workOrderKind, workOrderState } from '@neon/core'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  createWorkOrder,
  getWorkOrder,
  getWorkOrderByKey,
  listWorkOrders,
  updateWorkOrder,
} from '../../domain/workOrders.js'
import type { Services } from '../../services.js'

const createBody = z.object({
  kind: workOrderKind,
  title: z.string().min(1),
  intent: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  doneWhen: z.array(doneWhenClause).optional(),
  declaredComponentIds: z.array(z.string()).optional(),
  repoId: z.string().nullable().optional(),
  blockedBy: z.array(z.string()).optional(),
  supersedes: z.string().nullable().optional(),
  state: workOrderState.optional(),
  id: z.string().optional(),
})

const patchBody = createBody.partial().omit({ kind: true, id: true })

export async function registerWorkOrderRoutes(app: FastifyInstance, _services: Services) {
  app.post('/api/work-orders', async (request, reply) => {
    const body = createBody.parse(request.body)
    const created = await createWorkOrder(request.neon, body)
    return reply.status(201).send(created)
  })

  app.get('/api/work-orders', async (request) => {
    const { state, kind, limit } = z
      .object({
        state: workOrderState.optional(),
        kind: workOrderKind.optional(),
        limit: z.coerce.number().optional(),
      })
      .parse(request.query)
    return { workOrders: await listWorkOrders(request.neon.db, { state, kind, limit }) }
  })

  /** Keyed lookup, because a key is what a person or an agent actually has. */
  app.get('/api/work-orders/:idOrKey', async (request) => {
    const { idOrKey } = z.object({ idOrKey: z.string() }).parse(request.params)
    return idOrKey.includes('-')
      ? getWorkOrderByKey(request.neon.db, idOrKey)
      : getWorkOrder(request.neon.db, idOrKey)
  })

  app.patch('/api/work-orders/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = patchBody.parse(request.body)
    return updateWorkOrder(request.neon, id, body)
  })
}
