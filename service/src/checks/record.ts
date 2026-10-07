import { parse as parseYaml } from 'yaml'

/**
 * A record — a decision, an analysis, a design note — as it lives in a
 * knowledge repo: YAML frontmatter for the structured fields, markdown sections
 * for the prose.
 *
 * Neon does not store the text. It reads it from git when a check needs to
 * verify something about it, and holds a content hash for drift detection.
 */
export interface ParsedRecord {
  frontmatter: Record<string, unknown>
  /** Section body keyed by a normalised heading: "Rejected alternatives" -> "rejected_alternatives". */
  sections: Record<string, string>
  /** `### heading` entries under each section, in order. */
  entries: Record<string, { title: string; body: string }[]>
}

export function normaliseKey(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function parseRecord(markdown: string): ParsedRecord {
  let body = markdown
  let frontmatter: Record<string, unknown> = {}

  const fenced = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown)
  if (fenced) {
    try {
      frontmatter = (parseYaml(fenced[1]!) as Record<string, unknown>) ?? {}
    } catch {
      // Malformed frontmatter is a finding for the check, not a crash here.
      frontmatter = {}
    }
    body = markdown.slice(fenced[0].length)
  }

  const sections: Record<string, string> = {}
  const entries: Record<string, { title: string; body: string }[]> = {}

  let currentSection: string | null = null
  let currentEntry: { title: string; body: string } | null = null

  for (const line of body.split('\n')) {
    const h2 = /^##\s+(.*)$/.exec(line)
    const h3 = /^###\s+(.*)$/.exec(line)

    if (h2) {
      currentSection = normaliseKey(h2[1]!)
      sections[currentSection] ??= ''
      entries[currentSection] ??= []
      currentEntry = null
      continue
    }
    if (h3 && currentSection) {
      currentEntry = { title: h3[1]!.trim(), body: '' }
      entries[currentSection]!.push(currentEntry)
      continue
    }
    if (currentEntry) currentEntry.body += `${line}\n`
    else if (currentSection) sections[currentSection] += `${line}\n`
  }

  for (const key of Object.keys(sections)) sections[key] = sections[key]!.trim()
  for (const list of Object.values(entries)) {
    for (const entry of list) entry.body = entry.body.trim()
  }

  return { frontmatter, sections, entries }
}

/**
 * Whether a named field is present and says something. A field may live in the
 * frontmatter or as a section — both are how people actually write these, and
 * insisting on one would make the check a formatting rule rather than a
 * substance one.
 */
export function fieldStatus(
  record: ParsedRecord,
  field: string,
): { present: boolean; detail: string } {
  const key = normaliseKey(field)

  const fromFrontmatter = record.frontmatter[key] ?? record.frontmatter[field]
  if (Array.isArray(fromFrontmatter)) {
    return fromFrontmatter.length > 0
      ? { present: true, detail: `${fromFrontmatter.length} entries` }
      : { present: false, detail: 'listed in the frontmatter but empty' }
  }
  if (typeof fromFrontmatter === 'string' && fromFrontmatter.trim() !== '') {
    return { present: true, detail: 'in the frontmatter' }
  }

  const listed = record.entries[key] ?? []
  if (listed.length > 0) {
    const empty = listed.filter((entry) => entry.body.trim() === '')
    return empty.length === listed.length
      ? { present: false, detail: `has ${listed.length} heading(s) but no content under them` }
      : { present: true, detail: `${listed.length} entries` }
  }

  const section = record.sections[key]
  if (typeof section === 'string' && section.trim() !== '') {
    return { present: true, detail: 'as a section' }
  }

  return { present: false, detail: 'missing' }
}
