import { defineConfig } from 'vitest/config'

/**
 * Integration tests run against the compose Postgres and drive the real API.
 * They are a separate run so `npm test` stays useful with nothing running.
 */
export default defineConfig({
  test: {
    include: ['service/test/integration/**/*.test.ts'],
    environment: 'node',
    // The loop tests share a database; running files in parallel would have
    // them truncating each other's fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
