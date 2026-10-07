# NEON-4: Automated tests for every path through the plugin hooks

## Why

The hooks decide whether an agent may stop, edit or run a command, and until
NEON-1 they had no tests at all. Every stand-aside path matters as much as every
block: a hook that blocks when confused gets uninstalled, and one that stands
aside when it should block is worse than none.

## Acceptance criteria

- Stop: blocks on failure; stands aside for an unregistered repo, an unreachable
  service, no claimed work, `stop_hook_active`, and an API error; passes on
  success; reports an empty `done_when` without blocking; stops blocking after
  three consecutive blocks and resets on a pass.
- SessionStart: announces claimed work, says when nothing is claimed, and is
  silent for an unregistered repo.
- PostToolUse: runs the formatter on the edited file and never blocks, even when
  lint fails.
- All of it runs in `npm test` with no service and no database.

## What changes

Tests only, in `plugin/hooks/hooks.test.ts`.
