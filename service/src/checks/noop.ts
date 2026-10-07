import type { CheckAdapter } from './types.js'

/**
 * Always passes. Its job is to let the whole loop be exercised end to end
 * before any check is real — if the loop is wrong, real checks would only make
 * it wrong more slowly.
 */
export const noopAdapter: CheckAdapter = {
  kind: 'noop',
  validate: () => [],
  async run(ctx) {
    ctx.log(`noop check ${ctx.check.name} passed`)
    return {
      result: 'pass',
      failureSummary: null,
      artifacts: [],
    }
  },
}
