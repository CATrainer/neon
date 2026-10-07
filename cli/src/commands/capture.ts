import { api } from '../api.js'
import { remoteUrl } from '../git.js'

interface CaptureResponse {
  idea: { id: string; title: string; expiresAt: string }
  matches: { id: string; title: string; score: number }[]
  priorRejections: {
    decisionKey: string
    decisionTitle: string
    alternative: string
    why: string
  }[]
}

/**
 * The front door from any terminal. One argument, no questions, no required
 * fields. Capture friction is what kills idea funnels, so this command must
 * never grow a prompt.
 */
export async function capture(args: string[]): Promise<void> {
  const text = args.filter((a) => !a.startsWith('--')).join(' ').trim()
  if (!text) {
    console.error('neon capture "<what you were thinking>"')
    process.exitCode = 1
    return
  }

  // First line is the title, the rest is the body. No other structure is asked
  // for and none is inferred.
  const [title = text, ...bodyLines] = text.split('\n')
  const remote = remoteUrl()

  let repoId: string | null = null
  if (remote) {
    try {
      const repo = await api<{ id: string }>(
        'GET',
        `/api/repos/resolve?remote=${encodeURIComponent(remote)}`,
      )
      repoId = repo.id
    } catch {
      // Not a registered repo. Capture works anyway — that is the point.
    }
  }

  const result = await api<CaptureResponse>('POST', '/api/ideas', {
    title: title.trim(),
    body: bodyLines.join('\n').trim(),
    source: 'manual',
    repoId,
  })

  console.log(`captured ${result.idea.id}`)
  console.log(`expires ${new Date(result.idea.expiresAt).toISOString().slice(0, 10)} unless touched`)

  if (result.priorRejections.length > 0) {
    console.log('\nthis was already rejected:')
    for (const rejection of result.priorRejections) {
      console.log(`  ${rejection.decisionKey}  ${rejection.alternative}`)
      console.log(`      because: ${rejection.why}`)
    }
    console.log('\nread why before going further — either it still holds, or you have a better idea now.')
  }

  if (result.matches.length > 0) {
    console.log('\nclose to existing ideas:')
    for (const match of result.matches) {
      console.log(`  ${match.id}  ${match.title}`)
    }
  }
}
