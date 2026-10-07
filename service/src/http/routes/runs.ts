import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getRun, listRuns, recordRun } from '../../domain/runs.js'
import type { Services } from '../../services.js'

/**
 * Recording a run that happened elsewhere — CI, a shared runner. The caller
 * reports the result and the pins; citability is derived here, so nobody can
 * promote their own run to evidence by asserting it.
 */
const recordBody = z.object({
  checkName: z.string().min(1),
  repoId: z.string().nullable().optional(),
  changeId: z.string().nullable().optional(),
  workOrderId: z.string().nullable().optional(),
  result: z.enum(['pass', 'fail', 'error']),
  score: z.number().nullable().optional(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  pins: z
    .object({
      artifactVersion: z.string().nullable().optional(),
      configCommit: z.string().nullable().optional(),
      fixtureVersion: z.string().nullable().optional(),
    })
    .optional(),
  artifacts: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.string(),
        sizeBytes: z.number(),
        preview: z.string().nullable(),
      }),
    )
    .optional(),
  trigger: z.enum(['local', 'ci', 'scheduled']).optional(),
  failureSummary: z.string().nullable().optional(),
  evaluatorModel: z.string().nullable().optional(),
  id: z.string().optional(),
})

export async function registerRunRoutes(app: FastifyInstance, _services: Services) {
  app.post('/api/runs', async (request, reply) => {
    const body = recordBody.parse(request.body)
    const run = await recordRun(request.neon, {
      ...body,
      repoId: body.repoId ?? null,
    })
    return reply.status(201).send(run)
  })

  app.get('/api/runs', async (request) => {
    const { changeId, checkId, limit } = z
      .object({
        changeId: z.string().optional(),
        checkId: z.string().optional(),
        limit: z.coerce.number().optional(),
      })
      .parse(request.query)
    return { runs: await listRuns(request.neon.db, { changeId, checkId, limit }) }
  })

  app.get('/api/runs/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    return getRun(request.neon.db, id)
  })
}
