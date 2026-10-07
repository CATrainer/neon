import { createLocalAuthProvider } from './auth/provider.js'
import { isLoopback, loadConfig, loadEnvFile } from './config.js'
import { createDb } from './db/client.js'
import { createStubGitHubProvider } from './github/provider.js'
import { buildApp } from './http/app.js'
import type { Services } from './services.js'

loadEnvFile()
const config = loadConfig()
const { db, close } = createDb(config.databaseUrl)

const services: Services = {
  config,
  db,
  auth: createLocalAuthProvider(db, config),
  github: createStubGitHubProvider(),
}

const app = await buildApp(services)

const shutdown = async () => {
  await app.close()
  await close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

if (!isLoopback(config.host)) {
  app.log.warn(
    `listening on ${config.host}: this service has no authentication and runs repo-declared shell commands, so anyone who can reach this address can do both`,
  )
}
await app.listen({ port: config.port, host: config.host })
