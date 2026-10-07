---
key: NEON-D-010
title: Finishing is judged on the latest recorded runs, and only a person at a terminal can override a failing verdict
state: proposed
decided_at: 2026-10-07
author: Claude Code, working from Caleb's brief; awaiting Caleb's confirmation
components: [service, cli, plugin]
evidence_runs: []
---

## Rationale

`finishWork` used to record completion whatever the checks said, and
`neon_finish_work` re-ran the whole `done_when` with no working directory and no
version pins. On NEON-1 that cost another twenty seconds and recorded three runs
with no commit, which the drafted PR body then cited instead of the three runs
already pinned to the commit being finished. So the evidence attached to
finished work was the weakest evidence available, and finishing did not depend
on the checks at all.

Now finishing executes nothing. `latestVerdict` takes, for each `done_when`
clause, the most recent run of that check with those parameters on the change,
and holds it to the clause's threshold with the same pure function a live run
uses. Missing, failing or erroring runs refuse with a 409 that names each one.
Given the commit being finished, a run made at a different commit is stale.

Overriding is a person's act. The MCP tool has no override parameter at all.
`neon finish --override "<reason>"` asks for the work order key at an
interactive prompt and refuses outright without a terminal, which an agent's
shell does not have; the reason is stored on the `change.finished` event next
to the verdict it overrode.

## Rejected alternatives

### Re-run the checks at finish, passing the working directory and pins

Rejected because it doubles the cost of finishing for no new information: the
checks just ran, against the same tree, and the Stop hook runs them again. It
also races a working tree the agent may still be editing, and it would still
let the agent finish by re-running until something flaky passed.

### An override parameter on neon_finish_work

Rejected because the agent is the one calling the tool. An override the gated
party can pass is not an override, it is a second way to finish.

### Accept the override on the REST API only, with no terminal step

Rejected because the API has no authentication, so anything that can run curl
on localhost could finish over failing checks. The terminal prompt is not
authentication either, but it puts the decision where an agent's tools do not
reach, and the event records it either way.

## What would change this

Authentication. Once requests carry a person's identity, the override can be a
permission on the REST endpoint and the terminal prompt becomes a convenience
rather than the guard. Also: checks slow enough that re-running at finish is
never acceptable would argue for a cache keyed by commit rather than for this.
