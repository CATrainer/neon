/**
 * A thin client over the REST API. The CLI holds no domain logic — it exists so
 * CI and the plugin's hooks have something to shell out to that does not need
 * an agent session.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function baseUrl(): string {
  return (process.env.NEON_URL ?? 'http://localhost:4000').replace(/\/+$/, '')
}

export async function api<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        // Recorded on every event, so a run's origin is not guesswork later.
        'x-neon-source': 'cli',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    throw new ApiError(
      0,
      'unreachable',
      `Neon is not reachable at ${baseUrl()}. Local work continues; only claims and checks need it. (${(err as Error).message})`,
    )
  }

  const text = await response.text()
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}

  if (!response.ok) {
    throw new ApiError(
      response.status,
      String(payload.error ?? 'error'),
      String(payload.message ?? response.statusText),
      payload.detail,
    )
  }
  return payload as T
}
