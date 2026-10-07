import { sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'

/**
 * Search across the corpus, returning references and summaries rather than full
 * content. The agent fetches detail on demand — front-loading whole records
 * makes it worse, not better.
 *
 * Rejected alternatives are searchable as first-class results. That is
 * deliberate and load-bearing: the most useful answer to "should we try X" is
 * often "we did, in March, and here is why it did not work".
 */
export type SearchKind =
  | 'decision'
  | 'rejected_alternative'
  | 'idea'
  | 'component'
  | 'contract'
  | 'work_order'

export interface SearchHit {
  kind: SearchKind
  id: string
  /** Human reference: a key where one exists, otherwise a name. */
  ref: string
  title: string
  summary: string
  score: number
  /** Present on rejected alternatives: which decision rejected it. */
  parentRef?: string
  state?: string
}

export async function search(
  db: Db,
  query: string,
  opts: { kind?: SearchKind; limit?: number; threshold?: number } = {},
): Promise<SearchHit[]> {
  const q = query.trim()
  if (q === '') return []
  const limit = opts.limit ?? 10
  const threshold = opts.threshold ?? 0.2

  const wanted = (kind: SearchKind) => !opts.kind || opts.kind === kind

  const hits: SearchHit[] = []

  if (wanted('decision')) {
    const rows = await db.execute<{
      id: string
      key: string
      title: string
      rationale: string
      state: string
      score: number
    }>(sql`
      SELECT id, key, title, rationale, state,
             GREATEST(similarity(search_text, ${q}), word_similarity(${q}, search_text)) AS score
      FROM decisions
      WHERE GREATEST(similarity(search_text, ${q}), word_similarity(${q}, search_text)) >= ${threshold}
      ORDER BY score DESC LIMIT ${limit}
    `)
    hits.push(
      ...rows.rows.map((r) => ({
        kind: 'decision' as const,
        id: r.id,
        ref: r.key,
        title: r.title,
        summary: firstSentence(r.rationale),
        state: r.state,
        score: Number(r.score),
      })),
    )
  }

  if (wanted('rejected_alternative')) {
    const rows = await db.execute<{
      id: string
      key: string
      decision_title: string
      alt_title: string
      why: string
      state: string
      score: number
    }>(sql`
      SELECT d.id, d.key, d.title AS decision_title, d.state,
             alt->>'title' AS alt_title, alt->>'why' AS why,
             GREATEST(
               similarity(concat_ws(' ', alt->>'title', alt->>'why'), ${q}),
               word_similarity(${q}, concat_ws(' ', alt->>'title', alt->>'why'))
             ) AS score
      FROM decisions d
      CROSS JOIN LATERAL jsonb_array_elements(d.rejected_alternatives) AS alt
      WHERE GREATEST(
              similarity(concat_ws(' ', alt->>'title', alt->>'why'), ${q}),
              word_similarity(${q}, concat_ws(' ', alt->>'title', alt->>'why'))
            ) >= ${threshold}
      ORDER BY score DESC LIMIT ${limit}
    `)
    hits.push(
      ...rows.rows.map((r) => ({
        kind: 'rejected_alternative' as const,
        id: r.id,
        ref: `${r.key}/rejected`,
        title: r.alt_title,
        summary: r.why,
        parentRef: `${r.key} — ${r.decision_title}`,
        state: r.state,
        score: Number(r.score),
      })),
    )
  }

  if (wanted('idea')) {
    const rows = await db.execute<{
      id: string
      title: string
      body: string
      state: string
      score: number
    }>(sql`
      SELECT id, title, body, state,
             GREATEST(similarity(search_text, ${q}), word_similarity(${q}, search_text)) AS score
      FROM ideas
      WHERE state IN ('open', 'promoted')
        AND GREATEST(similarity(search_text, ${q}), word_similarity(${q}, search_text)) >= ${threshold}
      ORDER BY score DESC LIMIT ${limit}
    `)
    hits.push(
      ...rows.rows.map((r) => ({
        kind: 'idea' as const,
        id: r.id,
        ref: r.id,
        title: r.title,
        summary: firstSentence(r.body),
        state: r.state,
        score: Number(r.score),
      })),
    )
  }

  if (wanted('work_order')) {
    const rows = await db.execute<{
      id: string
      key: string
      title: string
      intent: string
      state: string
      score: number
    }>(sql`
      SELECT id, key, title, intent, state,
             GREATEST(
               similarity(concat_ws(' ', title, intent), ${q}),
               word_similarity(${q}, concat_ws(' ', title, intent))
             ) AS score
      FROM work_orders
      WHERE GREATEST(
              similarity(concat_ws(' ', title, intent), ${q}),
              word_similarity(${q}, concat_ws(' ', title, intent))
            ) >= ${threshold}
      ORDER BY score DESC LIMIT ${limit}
    `)
    hits.push(
      ...rows.rows.map((r) => ({
        kind: 'work_order' as const,
        id: r.id,
        ref: r.key,
        title: r.title,
        summary: firstSentence(r.intent),
        state: r.state,
        score: Number(r.score),
      })),
    )
  }

  if (wanted('component')) {
    const rows = await db.execute<{
      id: string
      name: string
      description: string
      score: number
    }>(sql`
      SELECT id, name, description,
             GREATEST(
               similarity(concat_ws(' ', name, description), ${q}),
               word_similarity(${q}, concat_ws(' ', name, description))
             ) AS score
      FROM components
      WHERE GREATEST(
              similarity(concat_ws(' ', name, description), ${q}),
              word_similarity(${q}, concat_ws(' ', name, description))
            ) >= ${threshold}
      ORDER BY score DESC LIMIT ${limit}
    `)
    hits.push(
      ...rows.rows.map((r) => ({
        kind: 'component' as const,
        id: r.id,
        ref: r.name,
        title: r.name,
        summary: r.description,
        score: Number(r.score),
      })),
    )
  }

  if (wanted('contract')) {
    const rows = await db.execute<{
      id: string
      name: string
      version: string
      artifact_ref: string
      score: number
    }>(sql`
      SELECT id, name, version, artifact_ref,
             GREATEST(similarity(name, ${q}), word_similarity(${q}, name)) AS score
      FROM interface_contracts
      WHERE GREATEST(similarity(name, ${q}), word_similarity(${q}, name)) >= ${threshold}
      ORDER BY score DESC LIMIT ${limit}
    `)
    hits.push(
      ...rows.rows.map((r) => ({
        kind: 'contract' as const,
        id: r.id,
        ref: `${r.name}@${r.version}`,
        title: `${r.name} v${r.version}`,
        summary: `contract artifact: ${r.artifact_ref}`,
        score: Number(r.score),
      })),
    )
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Summaries, not bodies. One sentence is usually enough to decide whether to
 *  fetch the rest. */
export function firstSentence(text: string, max = 220): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed === '') return ''
  const stop = trimmed.search(/(?<=\.)\s/)
  const sentence = stop > 0 ? trimmed.slice(0, stop + 1) : trimmed
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence
}
