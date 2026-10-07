# NEON-6: Offer the neon-reviewer subagent from /neon:finish

## Why

The plugin ships a precision-first reviewer that reads the diff against the
acceptance criteria in fresh context, and nothing ever invokes it, so it is a
file rather than part of the workflow.

## Acceptance criteria

- `/neon:finish` offers the neon-reviewer as an optional step after the checks
  pass and before recording completion.
- The step says when to skip it and that findings go to the person, not into
  silent fixes.
