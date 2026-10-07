import { relative, resolve } from 'node:path'
import {
  BUILT_IN_PROTECTED,
  git,
  isUserSettingsFile,
  matchesGlob,
  readInput,
  repoConfig,
  shellNamesProtectedPath,
} from './lib.mjs'

/**
 * Protected paths, per repo, from `neon.yaml`:
 *
 *   protected_paths:
 *     - "infra/**"
 *     - ".github/workflows/**"
 *
 * plus a few protected everywhere (`BUILT_IN_PROTECTED`): Neon's own state and
 * the settings files that decide whether hooks run at all.
 *
 * Deny rather than warn: the paths worth protecting are the ones where a
 * plausible-looking edit is expensive, and a warning in a transcript nobody
 * reads is not a guardrail.
 */
const input = await readInput()
const cwd = input.cwd ?? process.cwd()

if (input.tool_name === 'Bash') {
  const hit = shellNamesProtectedPath(input.tool_input?.command)
  if (hit) {
    deny(
      `This command names ${hit}, which agents may not touch from the shell: it holds the state and settings that decide whether Neon's checks apply. If something there genuinely needs changing, ask the person you are working with to do it.`,
    )
  }
  process.exit(0)
}

const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path
if (!path) process.exit(0)

const absolute = resolve(cwd, path)
if (isUserSettingsFile(absolute)) {
  deny(
    `${absolute} is Claude Code's user settings, which can set environment variables and disable hooks. Ask the person you are working with to make this change.`,
  )
}

const root = git(['rev-parse', '--show-toplevel'], cwd)
if (!root) process.exit(0)

const config = repoConfig(root)
const declared = Array.isArray(config.protected_paths) ? config.protected_paths : []
const relativePath = relative(root, absolute).replace(/\\/g, '/')

const builtIn = BUILT_IN_PROTECTED.find((glob) => matchesGlob(relativePath, glob))
if (builtIn) {
  deny(
    `${relativePath} is protected in every repo (${builtIn}): it holds the state and settings that decide whether Neon's checks apply. Ask the person you are working with to make this change.`,
  )
}

const hit = declared.find((glob) => matchesGlob(relativePath, glob))
if (hit) {
  deny(
    `${relativePath} is a protected path in this repo (neon.yaml: ${hit}). If this edit is genuinely needed, ask the person you are working with to make it or to remove the protection.`,
  )
}
process.exit(0)

function deny(reason) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
  process.exit(0)
}
