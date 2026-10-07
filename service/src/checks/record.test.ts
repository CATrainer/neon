import { describe, expect, it } from 'vitest'
import { fieldStatus, parseRecord } from './record.js'

const DECISION = `---
key: D-11
title: Retrieval is dense-only for now
components: [retrieval]
---

## Rationale

One index to operate and one to tune.

## Rejected alternatives

### Hybrid sparse + dense retrieval

Two indexes to keep in sync for a gain we could not measure in March.

### Cross-encoder reranking

340ms against a 200ms budget.
`

describe('record parsing', () => {
  it('reads frontmatter and sections', () => {
    const record = parseRecord(DECISION)
    expect(record.frontmatter.key).toBe('D-11')
    expect(record.sections.rationale).toMatch(/One index/)
    expect(record.entries.rejected_alternatives).toHaveLength(2)
    expect(record.entries.rejected_alternatives![0]!.title).toMatch(/Hybrid/)
  })

  it('survives malformed frontmatter rather than throwing', () => {
    const record = parseRecord('---\n: : :\n---\n\n## Rationale\n\nbecause.\n')
    expect(record.frontmatter).toEqual({})
    expect(record.sections.rationale).toBe('because.')
  })

  it('accepts a field from either the frontmatter or a section', () => {
    const record = parseRecord(DECISION)
    expect(fieldStatus(record, 'components').present).toBe(true)
    expect(fieldStatus(record, 'rationale').present).toBe(true)
  })

  it('does not accept a heading with nothing under it', () => {
    const record = parseRecord('## Rejected alternatives\n\n### Something\n\n')
    const status = fieldStatus(record, 'rejected_alternatives')
    expect(status.present).toBe(false)
    expect(status.detail).toMatch(/no content/)
  })

  it('does not accept an empty list in the frontmatter', () => {
    const record = parseRecord('---\nrejected_alternatives: []\n---\n')
    expect(fieldStatus(record, 'rejected_alternatives').present).toBe(false)
  })

  it('reports a genuinely absent field as missing', () => {
    const record = parseRecord('## Rationale\n\nbecause.\n')
    expect(fieldStatus(record, 'rejected_alternatives')).toEqual({
      present: false,
      detail: 'missing',
    })
  })
})
