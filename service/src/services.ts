import type { Config } from './config.js'
import type { Db } from './db/client.js'
import type { AuthProvider } from './auth/provider.js'
import type { GitHubProvider } from './github/provider.js'

/**
 * Everything the routes and the MCP server are allowed to reach. Adapters are
 * passed in rather than imported, so a test can hand in a different forge or a
 * different auth mode without a flag inside the code.
 */
export interface Services {
  config: Config
  db: Db
  auth: AuthProvider
  github: GitHubProvider
}
