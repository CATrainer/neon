import { newId, type RepoKind } from '@neon/core'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { repos } from '../db/schema.js'
import type { Ctx } from './ctx.js'
import { recordEvent } from './events.js'
import { invalid, notFound } from './errors.js'

export type RepoRow = typeof repos.$inferSelect

export interface RegisterRepoInput {
  name: string
  remoteUrl: string
  kind: RepoKind
  defaultBranch?: string
  accessClass?: string
  /** Where it is checked out on this machine, if it is. A convenience for
   *  running checks locally — never treated as a fact about the repo. */
  localPath?: string | null
  keyPrefix?: string
}

/**
 * Registration is deliberately thin: a remote, a kind, done. Everything else
 * about the repo — branches, files, PR state — is git's to answer.
 */
export async function registerRepo(ctx: Ctx, input: RegisterRepoInput): Promise<RepoRow> {
  const remoteUrl = normaliseRemote(input.remoteUrl)
  if (remoteUrl === '') throw invalid('a repo needs a remote url')

  const existing = await findRepoByRemote(ctx.db, remoteUrl)
  if (existing) return existing

  const row: typeof repos.$inferInsert = {
    id: newId(),
    name: input.name,
    remoteUrl,
    kind: input.kind,
    accessClass: input.accessClass ?? 'internal',
    defaultBranch: input.defaultBranch ?? 'main',
    localPath: input.localPath ?? null,
    keyPrefix: (input.keyPrefix ?? defaultPrefix(input.name)).toUpperCase(),
  }

  return ctx.db.transaction(async (tx) => {
    const [created] = await tx.insert(repos).values(row).returning()
    await recordEvent(tx, {
      kind: 'repo.registered',
      subjectType: 'repo',
      subjectId: row.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { remoteUrl, kind: input.kind },
      idempotencyKey: `repo.registered:${row.id}`,
    })
    return created!
  })
}

/**
 * Remotes arrive in several shapes for the same repo — ssh, https, with or
 * without `.git`, with or without a trailing slash. They have to normalise to
 * one string or the session's repo cannot be inferred from its git remote.
 */
export function normaliseRemote(remote: string): string {
  let value = remote.trim()
  if (value === '') return ''
  value = value.replace(/^git\+/, '')
  const ssh = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+)$/.exec(value)
  if (ssh) value = `https://${ssh[1]}/${ssh[2]}`
  value = value.replace(/\.git$/, '').replace(/\/+$/, '')
  return value.toLowerCase()
}

export async function findRepoByRemote(db: Db, remote: string): Promise<RepoRow | undefined> {
  const [row] = await db
    .select()
    .from(repos)
    .where(eq(repos.remoteUrl, normaliseRemote(remote)))
    .limit(1)
  return row
}

export async function getRepo(db: Db, id: string): Promise<RepoRow> {
  const [row] = await db.select().from(repos).where(eq(repos.id, id)).limit(1)
  if (!row) throw notFound('repo', id)
  return row
}

export async function listRepos(db: Db): Promise<RepoRow[]> {
  return db.select().from(repos).orderBy(sql`registered_at DESC`)
}

/** `neon-service` -> `NEON`. Only a default; repos can be given a better one. */
function defaultPrefix(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, '')
  return (letters.slice(0, 4) || 'WO').toUpperCase()
}
