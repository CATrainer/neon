# NEON-2: Finish judges the latest runs and refuses while they fail

## Why

Finishing a change is meant to follow from its checks, but `finishWork` records
completion whatever they say, and `neon_finish_work` re-runs `done_when` with
no pins, so the evidence it cites is weaker than the runs it ignores and costs
another full run. Observed on NEON-1: finish re-ran three checks (about 20s) and
recorded three runs with no commit, citing those instead of the runs pinned to
`d8e0551`.

## Acceptance criteria

- `finishWork` refuses while any `done_when` clause's latest run on the change
  fails, errors or is missing.
- A person can finish over failing checks only through
  `neon finish --override "<reason>"` in an interactive terminal, and the reason
  is recorded on the event.
- `neon_finish_work` has no override parameter, does not re-run checks, and
  cites the latest runs.
- When the caller supplies the current commit, runs recorded at a different
  commit count as stale.
- The `neon_finish_work` description and `/neon:finish` say all of this.
- Integration and unit tests cover refusal, override, staleness and no re-runs.

## What changes

- `service/src/domain/runs.ts`: `latestVerdict` judges a change on its latest
  run per clause; threshold judgement is shared with live runs.
- `service/src/domain/changes.ts`: `finishWork` refuses on a failing verdict
  unless given a person's override, and records the verdict on the event.
- `service/src/mcp/server.ts`: finish no longer re-runs; optional
  `config_commit` for staleness; description updated.
- `cli`: new `neon finish` command, the only place an override can be given.
- `plugin/commands/finish.md`.
