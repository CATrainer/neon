import { relative } from 'node:path'
import { git, matchesGlob, readInput, repoConfig } from './lib.mjs'

/**
 * Protected paths, per repo, from `neon.yaml`:
 *
 *   protected_paths:
 *     - "infra/**"
 *     - ".github/workflows/**"
 *
 * Deny rather than warn: the paths worth protecting are the ones where a
 * plausible-looking edit is expensive, and a warning in a transcript nobody
 * reads is not a guardrail.
 */
const input = await readInput()
const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path
if (!path) process.exit(0)

const root = git(['rev-parse', '--show-toplevel'], input.cwd ?? process.cwd())
if (!root) process.exit(0)

const config = repoConfig(root)
const protectedPaths = Array.isArray(config.protected_paths) ? config.protected_paths : []
if (protectedPaths.length === 0) process.exit(0)

const relativePath = relative(root, path).replace(/\\/g, '/')
const hit = protectedPaths.find((glob) => matchesGlob(relativePath, glob))

if (hit) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${relativePath} is a protected path in this repo (neon.yaml: ${hit}). If this edit is genuinely needed, ask the person you are working with to make it or to remove the protection.`,
      },
    }),
  )
}
process.exit(0)
