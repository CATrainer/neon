import { loadConfig, loadEnvFile } from '../config.js'
import { createDb } from '../db/client.js'
import { migrate } from '../db/migrate.js'
import { seed } from './fixture.js'

/**
 * `npm run seed`. Migrates first so a fresh database is one command away, then
 * loads the fixture. `--keep` appends instead of wiping, which is occasionally
 * useful and usually a mistake.
 */
loadEnvFile()
const config = loadConfig()
const reset = !process.argv.includes('--keep')

const { db, close } = createDb(config.databaseUrl)
try {
  await migrate(config.databaseUrl, (m) => console.log(m))
  const counts = await seed(db, { reset })
  console.log(
    `seeded: ${counts.repos} repos, ${counts.workOrders} work orders, ${counts.ideas} ideas, ${counts.decisions} decisions, ${counts.runs} runs`,
  )
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await close()
}
