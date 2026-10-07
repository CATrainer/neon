/**
 * Token estimation for the context budget.
 *
 * Deliberately an approximation: the budget is a policy about how much of an
 * agent's context Neon is allowed to occupy, not an accounting figure, and a
 * real tokenizer would tie the budget to one model's vocabulary. Four
 * characters per token is close enough for English prose and code identifiers,
 * and it is stable — the same pack always costs the same.
 */
const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateTokensOf(value: unknown): number {
  return estimateTokens(typeof value === 'string' ? value : JSON.stringify(value ?? ''))
}
