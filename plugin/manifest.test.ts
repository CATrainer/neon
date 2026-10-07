import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The plugin must install the way the README says. `claude plugin validate`
 * is the real test, but it is not available in CI, so this holds the manifests
 * to the rules it enforces that this layout depends on (Claude Code's plugin
 * manifest reference, checked 2026-10-07).
 */
const PLUGIN = dirname(fileURLToPath(import.meta.url))
const ROOT = join(PLUGIN, '..')

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>

const plugin = readJson(join(PLUGIN, '.claude-plugin', 'plugin.json'))
const marketplace = readJson(join(ROOT, '.claude-plugin', 'marketplace.json'))

describe('the plugin manifest', () => {
  it('relies on the standard layout rather than naming default directories', () => {
    // `agents` accepts .md files only, never a directory, and `commands` or
    // `agents` replace the default scan rather than adding to it.
    for (const key of ['commands', 'agents', 'hooks', 'mcpServers']) {
      expect(plugin, `plugin.json should not set ${key}`).not.toHaveProperty(key)
    }
  })

  it('has every component at its default location', () => {
    expect(readdirSync(join(PLUGIN, 'commands')).filter((f) => f.endsWith('.md'))).toHaveLength(7)
    expect(readdirSync(join(PLUGIN, 'agents')).filter((f) => f.endsWith('.md'))).toEqual(['neon-reviewer.md'])
    expect(existsSync(join(PLUGIN, 'hooks', 'hooks.json'))).toBe(true)
    expect(existsSync(join(PLUGIN, '.mcp.json'))).toBe(true)
  })

  it('has a kebab-case name', () => {
    expect(plugin.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})

describe('the marketplace manifest', () => {
  it('lists the plugin by its manifest name, at a path that exists', () => {
    expect(marketplace).toMatchObject({ name: expect.any(String), owner: { name: expect.any(String) } })
    const entries = marketplace.plugins as { name: string; source: string }[]
    const entry = entries.find((p) => p.name === plugin.name)
    expect(entry).toBeDefined()
    expect(entry!.source).toMatch(/^\.\//)
    expect(existsSync(join(ROOT, entry!.source, '.claude-plugin', 'plugin.json'))).toBe(true)
  })
})
