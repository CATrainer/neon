import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { applyRuleBlock, hashContent } from '@neon/core'
import { api } from '../api.js'
import { resolveSession } from '../context.js'
import { valueOf } from './check.js'

interface RulePlanItem {
  decisionId: string
  decisionKey: string
  decisionTitle: string
  componentId: string | null
  componentName: string | null
  path: string
  globs: string[]
  block: string
  contentHash: string
  action: 'create' | 'update' | 'remove' | 'unchanged'
  reason: string
}

/**
 * `neon rules [--write] [--branch <name>]`
 *
 * Writes the constraints that can be expressed as path-scoped rules into the
 * files they govern, where an agent picks them up by touching those files
 * rather than by asking for them.
 *
 * It never commits. What it produces is a diff for a person to read — which is
 * the only reason it is safe for Neon to generate content into a repo at all.
 */
export async function rules(args: string[]): Promise<void> {
  const session = await resolveSession()
  if (!session.repo || !session.root) {
    console.error('this repo is not registered with Neon (or is not a git checkout)')
    process.exitCode = 1
    return
  }

  const { plan } = await api<{ plan: RulePlanItem[] }>(
    'GET',
    `/api/repos/${session.repo.id}/rules/plan`,
  )

  const pending = plan.filter((item) => item.action !== 'unchanged')
  if (pending.length === 0) {
    console.log(`${plan.length} rule(s), all current`)
    return
  }

  for (const item of pending) {
    console.log(`${item.action.padEnd(9)} ${item.path}  ${item.decisionKey}`)
    console.log(`          ${item.reason}`)
  }

  if (!args.includes('--write')) {
    console.log(`\n${pending.length} change(s) pending. Review with: neon rules --write`)
    return
  }

  const branch = valueOf(args, '--branch')
  if (branch) {
    const { execFileSync } = await import('node:child_process')
    execFileSync('git', ['checkout', '-b', branch], { cwd: session.root, stdio: 'inherit' })
  }

  const applied: {
    decisionId: string
    componentId: string | null
    path: string
    globs: string[]
    contentHash: string
    state: 'applied' | 'removed'
  }[] = []

  for (const item of pending) {
    const absolute = join(session.root, item.path)
    const existing = existsSync(absolute) ? readFileSync(absolute, 'utf8') : ''
    const next = applyRuleBlock(existing, item.decisionKey, item.block)

    if (next !== existing) {
      mkdirSync(dirname(absolute), { recursive: true })
      writeFileSync(absolute, next, 'utf8')
    }

    applied.push({
      decisionId: item.decisionId,
      componentId: item.componentId,
      path: item.path,
      globs: item.globs,
      contentHash: item.action === 'remove' ? '' : hashContent(item.block),
      state: item.action === 'remove' ? 'removed' : 'applied',
    })
  }

  await api('POST', `/api/repos/${session.repo.id}/rules/applied`, { applied })

  console.log(`\nwrote ${applied.length} change(s) to the working tree. Nothing is committed.`)
  console.log('review: git diff')
  console.log('These are generated from decisions — to change what one says, change the decision.')
}
