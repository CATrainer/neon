import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { assembleContext } from '../../context/assemble.js'
import { assembleGenerativeContext } from '../../context/generative.js'
import type { Services } from '../../services.js'

export async function registerContextRoutes(app: FastifyInstance, services: Services) {
  app.get('/api/work-orders/:key/context', async (request) => {
    const { key } = z.object({ key: z.string() }).parse(request.params)
    const { budget } = z.object({ budget: z.coerce.number().optional() }).parse(request.query)
    return assembleContext(request.neon.db, key, {
      budgetTokens: budget ?? services.config.contextTokenBudget,
      requestedBy: request.neon.actorId,
    })
  })

  app.get('/api/context/generative', async (request) => {
    const { focus, limit } = z
      .object({ focus: z.string().optional(), limit: z.coerce.number().optional() })
      .parse(request.query)
    return assembleGenerativeContext(request.neon.db, {
      focus: focus ?? null,
      limit,
      requestedBy: request.neon.actorId,
    })
  })
}
