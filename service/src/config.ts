import { z } from 'zod'

/**
 * Configuration is read once, validated, and passed explicitly. Nothing reads
 * `process.env` below this file — ambient configuration is how a local instance
 * ends up quietly holding cloud credentials.
 */
const schema = z.object({
  DATABASE_URL: z.string().default('postgres://neon:neon@localhost:5433/neon'),
  NEON_PORT: z.coerce.number().default(4000),
  NEON_LOG_LEVEL: z.string().default('info'),

  NEON_AUTH_MODE: z.enum(['local', 'github']).default('local'),
  NEON_LOCAL_USER_EMAIL: z.string().default('local@localhost'),
  NEON_LOCAL_USER_NAME: z.string().default('Local User'),
  NEON_LOCAL_USER_GITHUB_LOGIN: z.string().default(''),

  /** 32 bytes, base64. Absent is allowed only because nothing needs encrypting
   *  until GitHub tokens exist; the secrets store fails loudly without it. */
  NEON_SECRET_KEY: z.string().default(''),

  NEON_CONTEXT_TOKEN_BUDGET: z.coerce.number().default(6000),
  NEON_IDEA_TTL_DAYS: z.coerce.number().default(60),
})

export type Config = {
  databaseUrl: string
  port: number
  logLevel: string
  authMode: 'local' | 'github'
  localUser: { email: string; name: string; githubLogin: string | null }
  secretKey: string
  contextTokenBudget: number
  ideaTtlDays: number
}

/**
 * Reads `.env` from the repo root if it exists. Absent is fine: every value has
 * a working local default, so a fresh clone runs without ceremony.
 */
export function loadEnvFile(path = '.env'): void {
  try {
    process.loadEnvFile(path)
  } catch {
    // No .env, or already loaded. Neither is a problem.
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.parse(env)
  return {
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.NEON_PORT,
    logLevel: parsed.NEON_LOG_LEVEL,
    authMode: parsed.NEON_AUTH_MODE,
    localUser: {
      email: parsed.NEON_LOCAL_USER_EMAIL,
      name: parsed.NEON_LOCAL_USER_NAME,
      githubLogin: parsed.NEON_LOCAL_USER_GITHUB_LOGIN || null,
    },
    secretKey: parsed.NEON_SECRET_KEY,
    contextTokenBudget: parsed.NEON_CONTEXT_TOKEN_BUDGET,
    ideaTtlDays: parsed.NEON_IDEA_TTL_DAYS,
  }
}
