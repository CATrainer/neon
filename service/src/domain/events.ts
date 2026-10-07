import { newId } from '@neon/core'
import type { Db } from '../db/client.js'
import { events } from '../db/schema.js'

/**
 * Every domain mutation writes one of these in the same transaction as the
 * projection it updates. The log is what makes offline work mergeable: ids are
 * client-generatable and `idempotencyKey` makes replay a no-op.
 *
 * Nothing reads the log yet. That is deliberate — it is far cheaper to write
 * events from day one than to reconstruct history that was never recorded.
 */
export interface EventInput {
  kind: string
  subjectType: string
  subjectId: string
  actorId?: string | null
  source?: string
  payload?: Record<string, unknown>
  occurredAt?: Date
  idempotencyKey?: string | null
}

/** Accepts a database handle or a transaction — the log is always written in
 *  the same transaction as the change it describes. */
export type EventWriter = Pick<Db, 'insert'>

export async function recordEvent(tx: EventWriter, input: EventInput): Promise<void> {
  await tx
    .insert(events)
    .values({
      id: newId(),
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      actorId: input.actorId ?? null,
      source: input.source ?? 'api',
      occurredAt: input.occurredAt ?? new Date(),
      payload: input.payload ?? {},
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .onConflictDoNothing({ target: events.idempotencyKey })
}
