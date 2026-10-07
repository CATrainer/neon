import { defineConfig } from 'vitest/config'

/**
 * One runner for the whole workspace. `ui/` is deliberately excluded — it is a
 * design prototype with its own toolchain and is not part of this phase.
 *
 * Integration tests live under `service/test/integration` and need the compose
 * Postgres. They are excluded from the default run so `npm test` stays useful
 * with nothing running; `npm run test:integration` opts in.
 */
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'service/src/**/*.test.ts',
      'cli/src/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'ui/**'],
    environment: 'node',
  },
})
