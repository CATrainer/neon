import { execSync } from 'node:child_process'
import { relative } from 'node:path'
import { git, readInput, repoConfig } from './lib.mjs'

/**
 * Formatter and linter after an edit, from `neon.yaml`:
 *
 *   format:
 *     command: npm run format --
 *   lint:
 *     command: npm run lint
 *
 * The formatter gets the edited file appended; the linter runs as declared.
 * Neither blocks: a failing lint is information the agent should have, not a
 * reason to lose the edit. The definition of done is where lint is enforced.
 */
const SAFE_PATH = /^[\w./ @+,=~()[\]{}-]+$/

const input = await readInput()
const path = input.tool_input?.file_path ?? input.tool_input?.notebook_path
if (!path) process.exit(0)

const root = git(['rev-parse', '--show-toplevel'], input.cwd ?? process.cwd())
if (!root) process.exit(0)

const config = repoConfig(root)
const relativePath = relative(root, path).replace(/\\/g, '/')
const output = []

if (config.format?.command) {
  // The formatter is a shell command, so the path is pasted into a shell
  // string. Agents choose file names: a quote and an `&` in one would run
  // whatever follows. Only characters inert inside double quotes in both sh and
  // cmd.exe get through; anything else is left unformatted, and said so.
  if (SAFE_PATH.test(relativePath)) {
    output.push(run(`${config.format.command} "${relativePath}"`, root))
  } else {
    output.push(`neon: not formatting ${JSON.stringify(relativePath)}: its name has characters a shell would interpret`)
  }
}
if (config.lint?.command) {
  output.push(run(config.lint.command, root))
}

const text = output.filter(Boolean).join('\n').trim()
if (text) console.error(text)
process.exit(0)

function run(command, cwd) {
  try {
    execSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 45_000 })
    return ''
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').trim()
    return `neon: \`${command}\` reported:\n${detail.slice(0, 4000)}`
  }
}
