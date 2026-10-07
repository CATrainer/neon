import { newId } from '@neon/core'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { components } from '../db/schema.js'
import type { Ctx } from './ctx.js'
import { recordEvent } from './events.js'
import { invalid } from './errors.js'

export type ComponentRow = typeof components.$inferSelect

export interface DeclareComponentInput {
  repoId: string
  name: string
  pathGlobs: string[]
  description?: string
}

/**
 * A component is a named part of a repo with the paths it owns. Decisions
 * constrain components, and rules are generated into the directories those
 * globs are rooted in — so the globs are the load-bearing field, not the name.
 */
export async function declareComponent(
  ctx: Ctx,
  input: DeclareComponentInput,
): Promise<ComponentRow> {
  const name = input.name.trim()
  if (name === '') throw invalid('a component needs a name')
  if (input.pathGlobs.length === 0) {
    throw invalid('a component needs at least one path glob: which files does it own?')
  }

  const existing = await findComponent(ctx.db, input.repoId, name)
  const values = {
    id: existing?.id ?? newId(),
    repoId: input.repoId,
    name,
    pathGlobs: input.pathGlobs,
    description: input.description ?? '',
  }

  return ctx.db.transaction(async (tx) => {
    const [row] = existing
      ? await tx.update(components).set(values).where(eq(components.id, existing.id)).returning()
      : await tx.insert(components).values(values).returning()
    await recordEvent(tx, {
      kind: existing ? 'component.updated' : 'component.declared',
      subjectType: 'component',
      subjectId: values.id,
      actorId: ctx.actorId,
      source: ctx.source ?? 'api',
      payload: { name, pathGlobs: input.pathGlobs },
    })
    return row!
  })
}

export async function findComponent(
  db: Db,
  repoId: string,
  name: string,
): Promise<ComponentRow | undefined> {
  const [row] = await db
    .select()
    .from(components)
    .where(and(eq(components.repoId, repoId), eq(components.name, name)))
    .limit(1)
  return row
}

export async function listComponents(db: Db, repoId: string): Promise<ComponentRow[]> {
  return db.select().from(components).where(eq(components.repoId, repoId))
}
