import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseImport } from './parse.js'

const DECISIONS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'knowledge', 'decisions')

const decisionBlock = (body: string) => ['```neon-decision', body.trim(), '```'].join('\n')

const RECORD = `---
title: Price per seat, not per run
state: proposed
decided_at: 2026-10-01
author: caleb
components: [billing, api]
evidence_runs: []
---

## Rationale

Buyers budget per head. Usage pricing made every demo a negotiation.

## Rejected alternatives

### Price per check run

Unpredictable bills for a team whose agents run checks constantly.

### Flat team price

Leaves money on the table above ten seats.

## What would change this

Customers asking to pay for usage because their seat counts are tiny.`

describe('parsing an import', () => {
  it('reads capture lines as the CLI would: first line title, the rest body', () => {
    const parsed = parseImport(
      [
        '## Ideas',
        '',
        'neon capture "Cache context packs per commit',
        'Assembly reruns on every call even when nothing changed."',
        'neon capture "One-line idea with \\"quoted\\" words"',
        '- neon capture "A bulleted one"',
      ].join('\n'),
    )
    expect(parsed.ideas).toEqual([
      { title: 'Cache context packs per commit', body: 'Assembly reruns on every call even when nothing changed.' },
      { title: 'One-line idea with "quoted" words', body: '' },
      { title: 'A bulleted one', body: '' },
    ])
  })

  it('reads decision blocks, keeping rejected alternatives and what would change them', () => {
    const parsed = parseImport(['## Decisions', '', decisionBlock(RECORD)].join('\n'))
    expect(parsed.problems).toEqual([])
    const [decision] = parsed.decisions
    expect(decision).toMatchObject({
      key: null,
      title: 'Price per seat, not per run',
      state: 'proposed',
      components: ['billing', 'api'],
    })
    expect(decision!.rejectedAlternatives.map((a) => a.title)).toEqual(['Price per check run', 'Flat team price'])
    expect(decision!.rationale).toMatch(/^Buyers budget per head/)
    expect(decision!.rationale).toMatch(/What would change this: Customers asking/)
    expect(decision!.decidedAt?.toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it('does not read capture lines inside a decision block as ideas', () => {
    const block = decisionBlock(RECORD.replace('Buyers budget per head.', 'Buyers budget per head.\nneon capture "not an idea"'))
    expect(parseImport(block).ideas).toEqual([])
  })

  it('refuses a decision with no rejected alternative, and says which', () => {
    const lonely = RECORD.replace(/## Rejected alternatives[\s\S]*?## What would change this/, '## What would change this')
    const parsed = parseImport(decisionBlock(lonely))
    expect(parsed.decisions).toEqual([])
    expect(parsed.problems[0]).toMatch(/decision block 1 \("Price per seat, not per run"\): no rejected alternative/)
  })

  it('reads a whole file that is one record', () => {
    const parsed = parseImport(RECORD)
    expect(parsed.decisions).toHaveLength(1)
    expect(parsed.ideas).toEqual([])
  })

  it('reads every record in knowledge/decisions, with its key, state and date', () => {
    const files = readdirSync(DECISIONS).filter((f) => f.endsWith('.md'))
    expect(files.length).toBeGreaterThanOrEqual(8)
    for (const file of files) {
      const parsed = parseImport(readFileSync(join(DECISIONS, file), 'utf8'))
      expect(parsed.problems, file).toEqual([])
      expect(parsed.decisions[0]!.key, file).toMatch(/^NEON-D-\d{3}$/)
      expect(parsed.decisions[0]!.decidedAt, file).not.toBeNull()
    }
  })
})
