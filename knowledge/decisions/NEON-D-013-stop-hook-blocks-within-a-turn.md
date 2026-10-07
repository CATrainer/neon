---
key: NEON-D-013
title: The Stop hook keeps blocking within a turn while the checks fail, up to three consecutive blocks
state: proposed
decided_at: 2026-10-07
author: Claude Code, working from Caleb's brief; awaiting Caleb's confirmation
components: [plugin]
evidence_runs: []
---

## Rationale

Claude Code sets `stop_hook_active` in the Stop hook's input once the agent is
continuing because a stop hook blocked. The hook used to exit immediately
whenever it saw that flag, so it blocked exactly once per turn: the agent's
second attempt to stop went through with the definition of done still failing.
The three-block ceiling only ever counted across separate turns. "Refuses to end
a turn while the definition of done fails" was true for one attempt.

Now the hook ignores the flag and runs the checks on every attempt. Looping is
bounded by the hook's own counter: after three consecutive blocks in a session
it stands aside and says the work still fails, and a passing check resets the
count. Claude Code also caps consecutive stop-hook continuations (eight by
default, per its hooks documentation), which is a backstop, not the design.

The cost is a check run per attempt while the work fails. That is the price of
the gate meaning what it says, and it falls only on work that is failing.

## Rejected alternatives

### Keep standing aside on stop_hook_active

Rejected because it makes the gate one-shot. An agent that is told once and
then simply tries to stop again gets through, which is the behaviour the hook
exists to prevent.

### Block without any ceiling of our own

Rejected because work the agent genuinely cannot fix (a broken environment, a
check that is itself wrong) would burn a turn of retries every time, and a gate
that traps people gets uninstalled. Relying on Claude Code's own cap would hand
the design to a default we do not control.

### Skip re-running checks within a turn and reuse the last verdict

Rejected because the agent is supposed to be fixing the work between attempts;
reusing a stale verdict would block it after it had fixed the problem.

## What would change this

Checks slow enough that re-running on every stop attempt is unreasonable, which
would argue for reusing a verdict when nothing in the tree changed since the
last run (keyed by a hash of the working tree rather than by time).
