import { newId } from '@neon/core'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { getAdapter, registeredKinds } from '../checks/registry.js'
import type { CheckDeclaration } from '../checks/types.js'
import type { Db } from '../db/client.js'
import { checks } from '../db/schema.js'
import type { Ctx } from './ctx.js'
import { recordEvent } from './events.js'
import { invalid, notFound } from './errors.js'

export type CheckRow = typeof checks.$inferSelect

/**
 * Checks are declared by the repo, in `neon.checks.yaml`, and synced here. That
 * is what keeps evidence kinds out of the schema: a repo can declare a check
 * this service has never heard of the name of, as long as its kind has an
 * adapter.
 */
export async function syncChecks(
  ctx: Ctx,
  repoId: string | null,
  declarations: CheckDeclaration[],
): Promise<CheckRow[]> {
  const problems: string[] = []
  for (const declaration of declarations) {
    const adapter = getAdapter(declaration.kind)
    if (!adapter) {
      problems.push(
        `check "${declaration.name}": no adapter for kind "${declaration.kind}" (have: ${registeredKinds().join(', ')})`,
      )
      continue
    }
    problems.push(...adapter.validate(declaration).map((p) => `check "${declaration.name}": ${p}`))
  }
  if (problems.length > 0) {
    throw invalid(`check declarations are not valid: ${problems.join('; ')}`, { problems })
  }

  const saved: CheckRow[] = []
  await ctx.db.transaction(async (tx) => {
    for (const declaration of declarations) {
      const existing = await findCheck(tx, repoId, declaration.name)
      const values = {
        id: existing?.id ?? newId(),
        repoId,
        name: declaration.name,
        kind: declaration.kind,
        runnerRef: declaration.runnerRef ?? '',
        requiresEnvironment: declaration.requiresEnvironment ?? false,
        requiresFixture: declaration.requiresFixture ?? false,
        description: declaration.description ?? '',
        defaultParams: declaration.defaultParams ?? {},
        resultSchema: declaration.resultSchema ?? null,
      }
      const [row] = existing
        ? await tx.update(checks).set(values).where(eq(checks.id, existing.id)).returning()
        : await tx.insert(checks).values(values).returning()
      saved.push(row!)
    }
    await recordEvent(tx, {
      kind: 'checks.synced',
      subjectType: 'repo',
      subjectId: repoId ?? 'global',
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { names: declarations.map((d) => d.name) },
    })
  })
  return saved
}

/** Repo-scoped checks win over global ones of the same name. */
export async function findCheck(
  db: Pick<Db, 'select'>,
  repoId: string | null,
  name: string,
): Promise<CheckRow | undefined> {
  const rows = await db
    .select()
    .from(checks)
    .where(
      and(
        eq(checks.name, name),
        repoId ? or(eq(checks.repoId, repoId), isNull(checks.repoId)) : isNull(checks.repoId),
      ),
    )
  return rows.find((r) => r.repoId === repoId) ?? rows.find((r) => r.repoId === null)
}

export async function resolveCheck(db: Db, repoId: string | null, name: string): Promise<CheckRow> {
  const found = await findCheck(db, repoId, name)
  if (!found) throw notFound('check', name)
  return found
}

export async function listChecks(db: Db, repoId?: string | null): Promise<CheckRow[]> {
  const q = db.select().from(checks).$dynamic()
  if (repoId !== undefined) {
    q.where(repoId === null ? isNull(checks.repoId) : or(eq(checks.repoId, repoId), isNull(checks.repoId)))
  }
  return q.orderBy(sql`name`)
}
