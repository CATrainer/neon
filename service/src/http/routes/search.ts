import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { search } from '../../domain/search.js'
import type { Services } from '../../services.js'

export async function registerSearchRoutes(app: FastifyInstance, _services: Services) {
  app.get('/api/search', async (request) => {
    const { q, kind, limit } = z
      .object({
        q: z.string(),
        kind: z
          .enum([
            'decision',
            'rejected_alternative',
            'idea',
            'component',
            'contract',
            'work_order',
          ])
          .optional(),
        limit: z.coerce.number().optional(),
      })
      .parse(request.query)
    return { hits: await search(request.neon.db, q, { kind, limit }) }
  })
}
