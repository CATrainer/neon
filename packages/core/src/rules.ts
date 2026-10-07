/**
 * Managed blocks inside path-scoped rule files.
 *
 * A rule file belongs to the repo and may contain anything a human put there.
 * Neon owns only the block between its markers: it can replace or remove that,
 * and must never touch the rest. Both the service (which generates) and the CLI
 * (which writes) use these, so there is one definition of what "managed" means.
 */
export const ruleStartMarker = (key: string) => `<!-- neon:${key} -->`
export const ruleEndMarker = (key: string) => `<!-- /neon:${key} -->`

/** Insert, replace, or (with an empty block) remove the managed block. */
export function applyRuleBlock(existing: string, decisionKey: string, block: string): string {
  const start = ruleStartMarker(decisionKey)
  const end = ruleEndMarker(decisionKey)
  const from = existing.indexOf(start)
  const to = existing.indexOf(end)

  if (from !== -1 && to !== -1) {
    const before = existing.slice(0, from)
    const after = existing.slice(to + end.length)
    if (block === '') {
      const joined = `${before.trimEnd()}\n\n${after.trimStart()}`.trim()
      return joined === '' ? '' : `${joined}\n`
    }
    return `${before}${block}${after}`
  }

  if (block === '') return existing
  const separator = existing.trim() === '' ? '' : '\n\n'
  return `${existing.trimEnd()}${separator}${block}\n`
}
