import type { Config } from '../config.js'
import type { Db } from '../db/client.js'

/**
 * Everything a domain function needs: a database handle (which may be a
 * transaction), configuration, and who is acting. Nothing reads ambient state.
 */
export interface Ctx {
  db: Db
  config: Config
  actorId: string
  /** Where this mutation came from, recorded on every event. */
  source?: string
}

export const withDb = (ctx: Ctx, db: Db): Ctx => ({ ...ctx, db })
