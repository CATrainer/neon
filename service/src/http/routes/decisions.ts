import { decisionState } from '@neon/core'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  attachEvidence,
  createDecision,
  getDecision,
  listDecisions,
  listEvidence,
} from '../../domain/decisions.js'
import type { Services } from '../../services.js'

const createBody = z.object({
  title: z.string().min(1),
  rationale: z.string().default(''),
  rejectedAlternatives: z
    .array(z.object({ title: z.string(), why: z.string() }))
    .optional(),
  componentIds: z.array(z.string()).optional(),
  state: decisionState.optional(),
  settlingCondition: z.string().nullable().optional(),
  positions: z.array(z.object({ holder: z.string(), summary: z.string() })).optional(),
  workOrderIds: z.array(z.string()).optional(),
  supersedes: z.string().nullable().optional(),
  recordRef: z.string().nullable().optional(),
  recordContentHash: z.string().nullable().optional(),
  id: z.string().optional(),
  key: z.string().optional(),
})

export async function registerDecisionRoutes(app: FastifyInstance, _services: Services) {
  app.post('/api/decisions', async (request, reply) => {
    const body = createBody.parse(request.body)
    const decision = await createDecision(request.neon, body)
    return reply.status(201).send(decision)
  })

  app.get('/api/decisions', async (request) => {
    const { state, componentId, limit } = z
      .object({
        state: decisionState.optional(),
        componentId: z.string().optional(),
        limit: z.coerce.number().optional(),
      })
      .parse(request.query)
    return { decisions: await listDecisions(request.neon.db, { state, componentId, limit }) }
  })

  app.get('/api/decisions/:idOrKey', async (request) => {
    const { idOrKey } = z.object({ idOrKey: z.string() }).parse(request.params)
    const decision = await getDecision(request.neon.db, idOrKey)
    return { ...decision, evidenceRunIds: await listEvidence(request.neon.db, decision.id) }
  })

  /** Attaching evidence. Non-citable runs are refused, with the missing pin
   *  named — the point is to get the run pinned, not to win the argument. */
  app.post('/api/decisions/:id/evidence', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const { runId } = z.object({ runId: z.string() }).parse(request.body)
    await attachEvidence(request.neon, id, runId)
    return { decisionId: id, evidenceRunIds: await listEvidence(request.neon.db, id) }
  })
}
