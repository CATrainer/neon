import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { DomainError } from '../domain/errors.js'
import type { Ctx } from '../domain/ctx.js'
import type { Services } from '../services.js'
import { registerRepoRoutes } from './routes/repos.js'
import { registerIdeaRoutes } from './routes/ideas.js'
import { registerWorkOrderRoutes } from './routes/workOrders.js'
import { registerChangeRoutes } from './routes/changes.js'
import { registerRunRoutes } from './routes/runs.js'
import { registerDecisionRoutes } from './routes/decisions.js'
import { registerSearchRoutes } from './routes/search.js'
import { registerContextRoutes } from './routes/context.js'
import { registerRuleRoutes } from './routes/rules.js'
import { registerImportRoutes } from './routes/import.js'
import { registerMcpRoutes } from '../mcp/route.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved once per request: who is acting, and against what. */
    neon: Ctx
  }
}

export async function buildApp(services: Services): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: services.config.logLevel } })

  app.decorateRequest('neon', null as unknown as Ctx)

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const actor = await services.auth.actorFor(request.headers)
    request.neon = {
      db: services.db,
      config: services.config,
      actorId: actor.id,
      source: (request.headers['x-neon-source'] as string) ?? 'api',
    }
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.status(error.status).send({
        error: error.code,
        message: error.message,
        detail: error.detail ?? null,
      })
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'invalid_request',
        message: 'the request body is not valid',
        detail: error.issues,
      })
    }
    request.log.error(error)
    const fallback = error as { statusCode?: number; message?: string }
    return reply.status(fallback.statusCode ?? 500).send({
      error: 'internal',
      message: fallback.message ?? 'unexpected error',
    })
  })

  app.get('/health', async () => ({
    ok: true,
    authMode: services.auth.mode,
    github: services.github.available ? 'connected' : services.github.unavailableReason,
  }))

  app.get('/api/me', async (request) => {
    const actor = await services.auth.actorFor(request.headers)
    return actor
  })

  await registerRepoRoutes(app, services)
  await registerIdeaRoutes(app, services)
  await registerWorkOrderRoutes(app, services)
  await registerChangeRoutes(app, services)
  await registerRunRoutes(app, services)
  await registerDecisionRoutes(app, services)
  await registerSearchRoutes(app, services)
  await registerContextRoutes(app, services)
  await registerRuleRoutes(app, services)
  await registerImportRoutes(app, services)
  await registerMcpRoutes(app, services)

  return app
}
