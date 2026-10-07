import { newId, type User } from '@neon/core'
import { eq } from 'drizzle-orm'
import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { users } from '../db/schema.js'

/**
 * Auth is an adapter from the start, even though only one implementation
 * exists. GitHub OAuth arrives after the bootstrap point, and the local
 * instance must keep working with no GitHub connection at all — that only stays
 * true if nothing below this interface knows how a user was authenticated.
 */
export interface AuthProvider {
  mode: 'local' | 'github'
  /** Resolve the acting user for a request. Never returns null: a provider
   *  that cannot identify anyone should throw, not degrade silently. */
  actorFor(headers: Record<string, string | string[] | undefined>): Promise<User>
}

/**
 * Single-user mode. Everything is attributed to the configured user, which is
 * honest for a local instance and requires no sign-in ceremony to run the loop.
 */
export function createLocalAuthProvider(db: Db, config: Config): AuthProvider {
  let cached: User | null = null

  return {
    mode: 'local',
    async actorFor() {
      if (cached) return cached
      cached = await ensureUser(db, {
        name: config.localUser.name,
        email: config.localUser.email,
        githubLogin: config.localUser.githubLogin,
      })
      return cached
    },
  }
}

export async function ensureUser(
  db: Db,
  input: { name: string; email: string; githubLogin?: string | null },
): Promise<User> {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1)
  if (existing) return toUser(existing)

  const [created] = await db
    .insert(users)
    .values({
      id: newId(),
      name: input.name,
      email: input.email,
      githubLogin: input.githubLogin ?? null,
    })
    .onConflictDoNothing()
    .returning()

  if (created) return toUser(created)

  // Lost a race with a concurrent insert; the row exists now.
  const [row] = await db.select().from(users).where(eq(users.email, input.email)).limit(1)
  return toUser(row!)
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    githubLogin: row.githubLogin,
    avatarUrl: row.avatarUrl,
  }
}
