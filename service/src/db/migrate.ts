import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { loadConfig, loadEnvFile } from '../config.js'

/**
 * Migrations are plain SQL files applied in filename order, each in its own
 * transaction, recorded once applied. They are never edited after being
 * committed — a migration that has run somewhere is history.
 */
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

export async function migrate(databaseUrl: string, log: (m: string) => void = console.log) {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `)

    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (r) => r.name,
      ),
    )

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

    let count = 0
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err })
      }
      log(`applied ${file}`)
      count += 1
    }

    if (count === 0) log('no migrations to apply')
    return count
  } finally {
    await client.end()
  }
}

const isDirectRun = process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')
if (isDirectRun) {
  loadEnvFile()
  const config = loadConfig()
  migrate(config.databaseUrl).catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
}
