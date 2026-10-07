import { hashContent, type DecisionState, type RejectedAlternative } from '@neon/core'
import { parseRecord } from '../checks/record.js'

/**
 * The import format: what a ChatGPT conversation is asked to produce (see
 * docs/chatgpt-export-prompt.md), and what a decision record in
 * knowledge/decisions already is.
 *
 *   neon capture "Title on the first line
 *   Body on the lines after it, as the CLI reads it"
 *
 *   ```neon-decision
 *   ---
 *   title: ...
 *   ---
 *   ## Rationale
 *   ## Rejected alternatives
 *   ### The alternative
 *   Why it was rejected.
 *   ## What would change this
 *   ```
 *
 * A file that is itself one record (frontmatter first) is read as one
 * decision. The capture lines are real shell commands on purpose: the same
 * output can be pasted into a terminal instead of imported.
 */

export interface ImportedIdea {
  title: string
  body: string
}

export interface ImportedDecision {
  key: string | null
  title: string
  rationale: string
  rejectedAlternatives: RejectedAlternative[]
  /** Component names as the record gives them; the importer maps them to ids. */
  components: string[]
  state: DecisionState
  decidedAt: Date | null
  /** Hash of the record's own text, so Neon can tell later whether it drifted. */
  contentHash: string
}

export interface ParsedImport {
  ideas: ImportedIdea[]
  decisions: ImportedDecision[]
  /** What was found but cannot be imported, and why. */
  problems: string[]
}

const STATES: readonly DecisionState[] = ['proposed', 'accepted', 'contested', 'superseded']

export function parseImport(text: string): ParsedImport {
  const normalised = text.replace(/\r\n/g, '\n')
  const problems: string[] = []
  const decisions: ImportedDecision[] = []

  // A whole file that is one record, as in knowledge/decisions.
  if (/^---\n/.test(normalised)) {
    const decision = toDecision(normalised, 'the file', problems)
    if (decision) decisions.push(decision)
    return { ideas: [], decisions, problems }
  }

  const fence = /^```neon-decision[^\n]*\n([\s\S]*?)^```[ \t]*$/gm
  let outside = normalised
  let index = 0
  for (const match of normalised.matchAll(fence)) {
    index += 1
    const decision = toDecision(match[1]!, `decision block ${index}`, problems)
    if (decision) decisions.push(decision)
    outside = outside.replace(match[0], '')
  }

  return { ideas: captures(outside), decisions, problems }
}

/** `neon capture "..."`, possibly spanning lines, with `\"` for a quote. */
function captures(text: string): ImportedIdea[] {
  const ideas: ImportedIdea[] = []
  const pattern = /^[ \t>*-]*neon capture\s+"((?:[^"\\]|\\.)*)"/gm
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]!.replace(/\\(["\\])/g, '$1').trim()
    if (raw === '') continue
    // Same split as the CLI: the first line is the title, the rest the body.
    const [title = '', ...rest] = raw.split('\n')
    ideas.push({ title: title.trim(), body: rest.join('\n').trim() })
  }
  return ideas
}

function toDecision(record: string, where: string, problems: string[]): ImportedDecision | null {
  const parsed = parseRecord(record)
  const fm = parsed.frontmatter
  const title = typeof fm.title === 'string' ? fm.title.trim() : ''
  if (title === '') {
    problems.push(`${where}: no title in the frontmatter`)
    return null
  }

  const rejectedAlternatives = (parsed.entries.rejected_alternatives ?? [])
    .filter((entry) => entry.body.trim() !== '')
    .map((entry) => ({ title: entry.title, why: entry.body.trim() }))
  // A record with no rejected alternative is usually a decision nobody made,
  // which is the same reason the schema check refuses one.
  if (rejectedAlternatives.length === 0) {
    problems.push(`${where} ("${title}"): no rejected alternative with a reason, so it is not imported`)
    return null
  }

  const rationale = parsed.sections.rationale?.trim() ?? ''
  if (rationale === '') {
    problems.push(`${where} ("${title}"): no Rationale section`)
    return null
  }

  // The schema has no column for it, and it is the part a later reader most
  // needs, so it travels at the end of the rationale where search can see it.
  const wouldChange = parsed.sections.what_would_change_this?.trim()
  const state = STATES.find((s) => s === fm.state) ?? 'proposed'
  const decided = parseDate(fm.decided_at)

  return {
    key: typeof fm.key === 'string' && /^[A-Z]+(-[A-Z]+)*-\d+$/.test(fm.key) ? fm.key : null,
    title,
    rationale: wouldChange ? `${rationale}\n\nWhat would change this: ${wouldChange}` : rationale,
    rejectedAlternatives,
    components: Array.isArray(fm.components) ? fm.components.map(String) : [],
    state,
    decidedAt: decided,
    contentHash: hashContent(record),
  }
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
