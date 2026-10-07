# NEON-1: Make the Stop-hook override something an agent cannot set

## Why

The Stop hook is meant to be overridable by a person and not by the agent it is
holding to the bar. Today the agent can create `.neon/skip-checks` with one tool
call and the hook stands aside, so the guarantee is false.

## Acceptance criteria

- The Stop hook honours only `NEON_SKIP_CHECKS=1` from the environment Claude
  Code was launched with; a `.neon/skip-checks` file no longer overrides it.
- Write, Edit and NotebookEdit are denied on `.neon/**` in every repo, whether
  or not `neon.yaml` lists it.
- Shell commands that name the `.neon/` directory are denied by a PreToolUse
  hook on Bash.
- `/neon:promote` no longer needs to write into `.neon/`.
- A decision record names the chosen override and the rejected alternatives.
- Tests cover each of the above.

## What changes

- `plugin/hooks/stop.mjs`: the file override is removed; only the launch
  environment can skip checks.
- `plugin/hooks/pre-tool-use.mjs`: built-in protection for `.neon/**` and Claude
  Code's settings files (which can set environment variables or disable hooks),
  and a Bash branch that denies commands naming them.
- `plugin/hooks/hooks.json`: PreToolUse also matches Bash.
- `plugin/commands/promote.md`: the draft goes to `neon promote` on stdin.
- `knowledge/decisions/NEON-D-009-human-only-override.md`.
- `plugin/hooks/hooks.test.ts`: the first automated tests for the hooks.
