import { repoKind } from '@neon/core'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parse as parseYaml } from 'yaml'
import { syncChecks, listChecks } from '../../domain/checks.js'
import { declareComponent, listComponents } from '../../domain/components.js'
import type { CheckDeclaration } from '../../checks/types.js'
import { findRepoByRemote, getRepo, listRepos, registerRepo } from '../../domain/repos.js'
import { invalid, notFound } from '../../domain/errors.js'
import type { Services } from '../../services.js'

const registerBody = z.object({
  name: z.string().min(1),
  remoteUrl: z.string().min(1),
  kind: repoKind,
  defaultBranch: z.string().optional(),
  accessClass: z.string().optional(),
  localPath: z.string().nullable().optional(),
  keyPrefix: z.string().optional(),
})

/** A repo's declared checks, as they appear in `neon.checks.yaml`. */
const checkDeclaration = z.object({
  name: z.string().min(1),
  kind: z.enum(['noop', 'command', 'schema', 'prompt']),
  runnerRef: z.string().optional(),
  description: z.string().optional(),
  requiresEnvironment: z.boolean().optional(),
  requiresFixture: z.boolean().optional(),
  defaultParams: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  resultSchema: z.unknown().optional(),
})

const componentBody = z.object({
  name: z.string().min(1),
  pathGlobs: z.array(z.string()).min(1),
  description: z.string().optional(),
})

const checksBody = z.union([
  z.object({ checks: z.array(checkDeclaration) }),
  /** The file itself, so the CLI can post what it read without parsing it. */
  z.object({ yaml: z.string() }),
])

export async function registerRepoRoutes(app: FastifyInstance, _services: Services) {
  app.post('/api/repos', async (request, reply) => {
    const body = registerBody.parse(request.body)
    const repo = await registerRepo(request.neon, body)
    return reply.status(201).send(repo)
  })

  app.get('/api/repos', async (request) => ({ repos: await listRepos(request.neon.db) }))

  /** Resolving a repo from a git remote is how every agent session finds
   *  itself. It has to tolerate every shape a remote comes in. */
  app.get('/api/repos/resolve', async (request) => {
    const { remote } = z.object({ remote: z.string() }).parse(request.query)
    const repo = await findRepoByRemote(request.neon.db, remote)
    if (!repo) throw notFound('repo for remote', remote)
    return repo
  })

  app.get('/api/repos/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    return getRepo(request.neon.db, id)
  })

  app.get('/api/repos/:id/components', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    return { components: await listComponents(request.neon.db, id) }
  })

  /** Declaring a component is what gives decisions somewhere to attach and
   *  rules somewhere to land. The globs are the load-bearing part. */
  app.post('/api/repos/:id/components', async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const repo = await getRepo(request.neon.db, id)
    const body = componentBody.parse(request.body)
    const component = await declareComponent(request.neon, { ...body, repoId: repo.id })
    return reply.status(201).send(component)
  })

  app.get('/api/checks', async (request) => {
    const { repoId } = z.object({ repoId: z.string().optional() }).parse(request.query)
    return { checks: await listChecks(request.neon.db, repoId ?? undefined) }
  })

  /**
   * Checks are declared by the repo and synced here, which is what keeps
   * evidence kinds out of the schema.
   */
  app.post('/api/repos/:id/checks', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params)
    const repo = id === 'global' ? null : await getRepo(request.neon.db, id)
    const body = checksBody.parse(request.body)

    let declarations: CheckDeclaration[]
    if ('yaml' in body) {
      const parsed = parseYaml(body.yaml) as unknown
      const shape = z.object({ checks: z.array(checkDeclaration) }).safeParse(parsed)
      if (!shape.success) {
        throw invalid('neon.checks.yaml must contain a `checks:` list', shape.error.issues)
      }
      declarations = shape.data.checks as CheckDeclaration[]
    } else {
      declarations = body.checks as CheckDeclaration[]
    }

    return { checks: await syncChecks(request.neon, repo?.id ?? null, declarations) }
  })
}
