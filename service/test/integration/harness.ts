import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { createLocalAuthProvider } from '../../src/auth/provider.js'
import { loadConfig, loadEnvFile, type Config } from '../../src/config.js'
import { createDb, type DbHandle } from '../../src/db/client.js'
import { migrate } from '../../src/db/migrate.js'
import { createStubGitHubProvider } from '../../src/github/provider.js'
import { buildApp } from '../../src/http/app.js'

/**
 * Each integration file gets its own database, created and dropped around the
 * run. Sharing one would make the tests order-dependent, which is exactly the
 * property a verification system should not have.
 */
export interface Harness {
  app: FastifyInstance
  handle: DbHandle
  config: Config
  close: () => Promise<void>
}

export async function startHarness(name: string): Promise<Harness> {
  loadEnvFile()
  const base = loadConfig()
  const dbName = `neon_test_${name}_${randomUUID().slice(0, 8)}`.toLowerCase()

  const admin = new pg.Client({ connectionString: base.databaseUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${dbName}`)
  await admin.end()

  const databaseUrl = replaceDatabase(base.databaseUrl, dbName)
  await migrate(databaseUrl, () => {})

  const config: Config = { ...base, databaseUrl, logLevel: 'silent' }
  const handle = createDb(databaseUrl)
  const app = await buildApp({
    config,
    db: handle.db,
    auth: createLocalAuthProvider(handle.db, config),
    github: createStubGitHubProvider(),
  })

  return {
    app,
    handle,
    config,
    close: async () => {
      await app.close()
      await handle.close()
      const cleanup = new pg.Client({ connectionString: base.databaseUrl })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`)
      await cleanup.end()
    },
  }
}

function replaceDatabase(url: string, dbName: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${dbName}`
  return parsed.toString()
}

/** Thin helper so tests read as calls rather than as fetch ceremony. */
export async function call<T = unknown>(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const response = await app.inject({ method, url, payload: body as never })
  return {
    status: response.statusCode,
    body: response.body ? (JSON.parse(response.body) as T) : (undefined as T),
  }
}
