# NEON-11: Keep blocking within a turn while the checks still fail

## Why

The Stop hook stood aside whenever `stop_hook_active` was set, which Claude Code
sets once the agent is continuing because a stop hook blocked. So it refused
exactly once per turn, and the agent's second attempt to stop went through with
the checks still failing. Flagged in the earlier review (Appendix A, item 2) and
confirmed against Claude Code's hooks documentation on 2026-10-07.

## Acceptance criteria

- On `stop_hook_active` the hook still runs the checks and blocks again if they
  fail.
- It stops blocking after three consecutive blocks in a session, says so, and
  resets when the checks pass.
- Tests show repeated blocking within one turn and the ceiling.
- A decision record names the rejected alternatives (NEON-D-013).
- The plugin README and the hook's comment describe the behaviour.
