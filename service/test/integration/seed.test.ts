import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../../src/seed/fixture.js'
import { call, startHarness, type Harness } from './harness.js'

/**
 * The fixture is fiction. Seeding a database someone has actually used would
 * either wipe their work or mix invented people and repos into it, so the seed
 * refuses unless told the database really is scratch.
 */
let h: Harness

beforeAll(async () => {
  h = await startHarness('seed')
})
afterAll(async () => {
  await h.close()
})

const count = async (table: string) => {
  const result = await h.handle.db.execute<{ n: string }>(sql.raw(`SELECT count(*) AS n FROM ${table}`))
  return Number(result.rows[0]!.n)
}

describe('seeding', () => {
  it('seeds a fresh database, and the fixture itself records no events', async () => {
    await seed(h.handle.db)
    expect(await count('repos')).toBe(2)
    expect(await count('events')).toBe(0)
  })

  it('re-seeds a database that has only ever been seeded', async () => {
    await expect(seed(h.handle.db)).resolves.toBeDefined()
  })

  it('refuses a database that has been used for real, and leaves it untouched', async () => {
    const captured = await call<{ idea: { id: string } }>(h.app, 'POST', '/api/ideas', {
      title: 'A real idea that must survive a stray npm run seed',
    })
    expect(captured.status).toBe(201)
    const ideasBefore = await count('ideas')

    await expect(seed(h.handle.db)).rejects.toThrow(/refusing to seed/)
    await expect(seed(h.handle.db, { reset: false })).rejects.toThrow(/refusing to seed/)
    expect(await count('ideas')).toBe(ideasBefore)
  })

  it('seeds a used database only when forced', async () => {
    await seed(h.handle.db, { force: true })
    expect(await count('events')).toBe(0)
  })
})
