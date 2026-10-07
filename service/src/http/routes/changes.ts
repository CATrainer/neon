import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  abandonChange,
  finishWork,
  getChange,
  listChanges,
  startWork,
} from '../../domain/changes.js'
import { runDoneWhen } from '../../domain/runs.js'
import type { Services } from '../../services.js'

const startBody = z.object({
  workOrderKey: z.string().min(1),
  repoId: z.string().min(1),
  id: z.string().optional(),
})

const finishBody = z.object({
  summary: z.string().default(''),
  prUrl: z.string().nullable().optional(),
  specContentHash: z.string().nullable().optional(),
})

const checkBody = z.object({
  workdir: z.string().nullable().optional(),
  trigger: z.enum(['local', 'ci', 'scheduled']).optional(),
  pins: z
    .object({
      artifactVersion: z.string().nullable().optional(),
      configCommit: z.string().nullable().optional(),
      fixtureVersion: z.string().nullable().optional(),
    })
    .optional(),
})

export async function registerChangeRoutes(app: FastifyInstance, _services: Services) {
  app.post('/api/changes/start', async (request, reply) => {
    const body = startBody.parse(request.body)
    const result = await startWork(request.neon, body)
    return reply.status(result.resumed ? 200 : 201).send(result)
  })

  app.get('/api/changes', async (request) => {
    const { repoId } = z.object({ repoId: z.string().optional() }).parse(request.query)
    return { changes: await listChanges(request.neon.db, repoId) }
  })

  app.get('/api/changes/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    return getChange(request.neon.db, id)
  })

  /** Executes the work order's done_when against this change. The verdict is
   *  the runs it records, not this response. */
  app.post('/api/changes/:id/check', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = checkBody.parse(request.body ?? {})
    return runDoneWhen(request.neon, { changeId: id, ...body })
  })

  app.post('/api/changes/:id/finish', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const body = finishBody.parse(request.body ?? {})
    return finishWork(request.neon, { changeId: id, ...body })
  })

  app.post('/api/changes/:id/abandon', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const { reason } = z.object({ reason: z.string().optional() }).parse(request.body ?? {})
    return abandonChange(request.neon, id, reason)
  })
}
