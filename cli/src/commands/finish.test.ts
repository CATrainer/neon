import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api.js'
import { finish, type Terminal } from './finish.js'

vi.mock('../api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api.js')>()),
  api: vi.fn(),
}))

const mockedApi = vi.mocked(api)

const finished = {
  change: { id: 'chg-1', state: 'open', branch: 'neon/work/wo-1-x' },
  verdict: { workOrderKey: 'WO-1', passed: false, results: [] },
  overridden: true,
}

/** Answers lookups, and records what was posted to finish. */
function serve(onFinish: (body: unknown) => unknown = () => finished) {
  mockedApi.mockImplementation(async (method: string, path: string, body?: unknown) => {
    if (method === 'GET' && path === '/api/changes/chg-1') return { workOrderId: 'wo-1' }
    if (method === 'GET' && path === '/api/work-orders/wo-1') return { key: 'WO-1' }
    if (method === 'POST' && path === '/api/changes/chg-1/finish') return onFinish(body)
    throw new Error(`unexpected ${method} ${path}`)
  })
}

const finishCalls = () =>
  mockedApi.mock.calls.filter(([method, path]) => method === 'POST' && String(path).endsWith('/finish'))

const terminal = (interactive: boolean, answer = ''): Terminal => ({
  interactive,
  ask: vi.fn(async () => answer),
})

describe('neon finish --override', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('refuses without a terminal, before anything is sent', async () => {
    // An agent's shell has no TTY; piping the key in does not give it one.
    serve()
    await finish(['--change', 'chg-1', '--override', 'flaky upstream'], terminal(false, 'WO-1'))
    expect(process.exitCode).toBe(1)
    expect(finishCalls()).toHaveLength(0)
  })

  it('refuses when the person does not type the work order key', async () => {
    serve()
    await finish(['--change', 'chg-1', '--override', 'flaky upstream'], terminal(true, 'yes'))
    expect(process.exitCode).toBe(1)
    expect(finishCalls()).toHaveLength(0)
  })

  it('refuses an override with no reason', async () => {
    serve()
    await finish(['--change', 'chg-1', '--override', ''], terminal(true, 'WO-1'))
    expect(process.exitCode).toBe(1)
    expect(finishCalls()).toHaveLength(0)
  })

  it('sends the reason once the key is typed', async () => {
    serve()
    await finish(['--change', 'chg-1', '--override', 'flaky upstream'], terminal(true, 'wo-1'))
    expect(process.exitCode).toBeUndefined()
    const [, , body] = finishCalls()[0]!
    expect(body).toMatchObject({ override: { reason: 'flaky upstream' } })
  })
})

describe('neon finish', () => {
  beforeEach(() => {
    mockedApi.mockReset()
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('sends no override, and the current commit for staleness', async () => {
    serve(() => ({ ...finished, overridden: false }))
    await finish(['--change', 'chg-1', '--summary', 'done'], terminal(false))
    const [, , body] = finishCalls()[0]!
    expect(body).toMatchObject({ summary: 'done', override: null })
    expect((body as { atCommit: unknown }).atCommit).toEqual(expect.any(String))
  })

  it('reports a refusal and exits 1 rather than throwing', async () => {
    serve(() => {
      throw new ApiError(409, 'conflict', 'WO-1 cannot finish while its definition of done fails')
    })
    await finish(['--change', 'chg-1'], terminal(false))
    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/cannot finish/))
  })
})
