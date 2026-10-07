import { loadConfig, loadEnvFile } from '../config.js'
import { createDb } from '../db/client.js'
import { migrate } from '../db/migrate.js'
import { seed } from './fixture.js'

/**
 * `npm run seed`. Migrates first so a fresh database is one command away, then
 * loads the fixture. `--keep` appends instead of wiping, which is occasionally
 * useful and usually a mistake. A database that has been used for real is
 * refused unless `--force` is given: the fixture is fiction, and real usage
 * lives in its own database.
 */
loadEnvFile()
const config = loadConfig()
const reset = !process.argv.includes('--keep')
const force = process.argv.includes('--force')

const { db, close } = createDb(config.databaseUrl)
try {
  console.log(`seeding ${new URL(config.databaseUrl).pathname.slice(1)} with the fictional fixture`)
  await migrate(config.databaseUrl, (m) => console.log(m))
  const counts = await seed(db, { reset, force })
  console.log(
    `seeded: ${counts.repos} repos, ${counts.workOrders} work orders, ${counts.ideas} ideas, ${counts.decisions} decisions, ${counts.runs} runs`,
  )
} catch (err) {
  console.error(err)
  process.exitCode = 1
} finally {
  await close()
}
