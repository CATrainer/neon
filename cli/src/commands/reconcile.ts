import { changedFiles, commitsSince } from '../git.js'
import { resolveSession } from '../context.js'
import { valueOf } from './check.js'

/**
 * The bypass path, made pleasant.
 *
 * There will be 2am hotfixes and offline days. Work done outside Neon is fine;
 * what is not fine is a corpus that quietly becomes fiction. This drafts what
 * should have existed and leaves the writing to a human — it deliberately does
 * not create anything.
 */
export async function reconcile(args: string[]): Promise<void> {
  const session = await resolveSession()
  const since = valueOf(args, '--since') ?? `origin/${session.repo?.defaultBranch ?? 'main'}`

  const commits = commitsSince(since)
  if (commits.length === 0) {
    console.log(`no commits between ${since} and HEAD`)
    return
  }

  const unrecorded = commits.filter((c) => !c.workOrderKey)
  const files = changedFiles(since)

  console.log(`${commits.length} commit(s) since ${since}, ${unrecorded.length} without a work order`)

  if (unrecorded.length === 0) {
    console.log('everything here is already accounted for')
    return
  }

  console.log('\nunrecorded:')
  for (const commit of unrecorded) {
    console.log(`  ${commit.sha.slice(0, 8)}  ${commit.subject}`)
  }

  console.log('\nfiles touched:')
  for (const file of files.slice(0, 20)) console.log(`  ${file}`)
  if (files.length > 20) console.log(`  … and ${files.length - 20} more`)

  console.log(`
Draft a work order from this and file it, then attach the commits:

  neon capture "${unrecorded[0]!.subject}

Reconciling ${unrecorded.length} commit(s) made outside Neon since ${since}.
Files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ', …' : ''}"

An agent can do better than this sketch: /neon:reconcile reads the diff and
drafts the intent, the acceptance criteria and any decisions the change implies.`)
}
