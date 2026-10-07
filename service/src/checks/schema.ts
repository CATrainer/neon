import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { hashContent, newId } from '@neon/core'
import { fieldStatus, parseRecord } from './record.js'
import type { CheckAdapter } from './types.js'

/** What each record kind must contain, unless the work order says otherwise. */
const REQUIRED_BY_KIND: Record<string, string[]> = {
  decision: ['rationale', 'rejected_alternatives', 'components'],
  analysis: ['question', 'findings', 'what_would_change_this'],
}

/**
 * Validates a record against a required structure. Deterministic and cheap.
 *
 * This is what makes inquiry work checkable at all. It cannot tell whether the
 * thinking is any good — that is the `prompt` adapter's job — but it can tell
 * whether a decision record names an alternative that was rejected and says
 * what it constrains, which is the difference between a record and a note.
 */
export const schemaAdapter: CheckAdapter = {
  kind: 'schema',

  validate(declaration) {
    const kind = declaration.defaultParams?.kind
    if (kind !== undefined && typeof kind !== 'string') {
      return ['`kind` must be a string naming the record kind, e.g. decision']
    }
    return []
  },

  async run(ctx) {
    const kind = String(ctx.params.kind ?? 'decision')
    const required = requiredFields(ctx.params.requires, kind)

    const relativePath = String(ctx.params.path ?? ctx.change?.specRef ?? '')
    if (!relativePath) {
      return {
        result: 'error',
        failureSummary: `${ctx.check.name} has no record to check: neither the change nor the check names a path.`,
      }
    }
    if (!ctx.workdir) {
      return {
        result: 'error',
        failureSummary: `${ctx.check.name} needs a checkout to read ${relativePath} from.`,
      }
    }

    const path = isAbsolute(relativePath) ? relativePath : join(ctx.workdir, relativePath)

    let content: string
    try {
      content = await readFile(path, 'utf8')
    } catch {
      return {
        result: 'fail',
        failureSummary: `no ${kind} record at ${relativePath} — the work produces a record, and there isn't one`,
      }
    }

    const record = parseRecord(content)
    const missing: string[] = []
    const present: string[] = []

    for (const field of required) {
      const status = fieldStatus(record, field)
      if (status.present) present.push(`${field} (${status.detail})`)
      else missing.push(`${field}: ${status.detail}`)
    }

    ctx.log(`${relativePath}: ${present.length}/${required.length} required fields present`)

    const artifacts = [
      {
        id: newId(),
        name: 'record-check.txt',
        kind: 'report',
        sizeBytes: content.length,
        preview: [
          `record: ${relativePath}`,
          `kind: ${kind}`,
          `hash: ${hashContent(content)}`,
          ...present.map((field) => `  ok      ${field}`),
          ...missing.map((field) => `  missing ${field}`),
        ].join('\n'),
      },
    ]

    if (missing.length > 0) {
      return {
        result: 'fail',
        failureSummary: `${relativePath} is not a complete ${kind} record — ${missing.join('; ')}`,
        artifacts,
      }
    }

    return { result: 'pass', artifacts }
  },
}

function requiredFields(requires: unknown, kind: string): string[] {
  if (Array.isArray(requires)) return requires.map(String)
  // Declared as a comma-separated string in yaml, which is how people write it.
  if (typeof requires === 'string' && requires.trim() !== '') {
    return requires.split(',').map((field) => field.trim())
  }
  return REQUIRED_BY_KIND[kind] ?? ['rationale']
}
