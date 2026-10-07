import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { isLoopback, loadConfig, loadEnvFile, ROOT_ENV_FILE } from './config.js'

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

  it('listens on loopback unless told otherwise', () => {
    // No authentication and a shell-running check adapter: exposure is opt-in.
    expect(loadConfig({}).host).toBe('127.0.0.1')
    expect(loadConfig({ NEON_HOST: '0.0.0.0' }).host).toBe('0.0.0.0')
  })

  it('knows which listen addresses stay on this machine', () => {
    expect(isLoopback('127.0.0.1')).toBe(true)
    expect(isLoopback('localhost')).toBe(true)
    expect(isLoopback('::1')).toBe(true)
    expect(isLoopback('0.0.0.0')).toBe(false)
    expect(isLoopback('::')).toBe(false)
    expect(isLoopback('192.168.1.20')).toBe(false)
  })

  it('treats a missing file as nothing to load', () => {
    expect(() => loadEnvFile(join(tmpdir(), 'neon-no-such-dir', '.env'))).not.toThrow()
    expect(loadConfig({}).databaseUrl).toBe('postgres://neon:neon@localhost:5433/neon')
  })
})
