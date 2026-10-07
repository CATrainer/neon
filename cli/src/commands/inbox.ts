import { api } from '../api.js'

interface Idea {
  id: string
  title: string
  capturedAt: string
  expiresAt: string
  state: string
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Somewhere for captured ideas to land. Without this, capture is a write-only
 * log — and until the UI exists, this is the only inbox there is.
 */
export async function inbox(args: string[]): Promise<void> {
  const all = args.includes('--all')
  const { ideas } = await api<{ ideas: Idea[] }>(
    'GET',
    all ? '/api/ideas?limit=100' : '/api/ideas?state=open&limit=100',
  )

  if (ideas.length === 0) {
    console.log('nothing captured')
    return
  }

  const sorted = [...ideas].sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
  )

  for (const idea of sorted) {
    const daysLeft = Math.round((new Date(idea.expiresAt).getTime() - Date.now()) / DAY)
    const fate =
      idea.state !== 'open'
        ? idea.state
        : daysLeft <= 0
          ? 'expiring'
          : `${daysLeft}d left`
    console.log(`${idea.id}  ${fate.padEnd(10)} ${idea.title}`)
  }

  console.log(`\n${sorted.length} idea(s). Expiry is silent: leaving one is a valid choice.`)
}
