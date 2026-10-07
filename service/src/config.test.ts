import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig, loadEnvFile, ROOT_ENV_FILE } from './config.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('configuration', () => {
  afterEach(() => {
    delete process.env.NEON_CONFIG_TEST_VAR
  })

  it('finds .env at the repo root, not in whatever directory the process started in', () => {
    // `npm run dev --workspace service` starts in service/, where a relative
    // `.env` would never be found.
    expect(ROOT_ENV_FILE).toBe(join(repoRoot, '.env'))
  })

  it('lets the environment win over the file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'neon-config-'))
    const file = join(dir, '.env')
    writeFileSync(file, 'NEON_CONFIG_TEST_VAR=from-file\n')

    process.env.NEON_CONFIG_TEST_VAR = 'from-shell'
    loadEnvFile(file)
    expect(process.env.NEON_CONFIG_TEST_VAR).toBe('from-shell')
  })

  it('treats a missing file as nothing to load', () => {
    expect(() => loadEnvFile(join(tmpdir(), 'neon-no-such-dir', '.env'))).not.toThrow()
    expect(loadConfig({}).databaseUrl).toBe('postgres://neon:neon@localhost:5433/neon')
  })
})
