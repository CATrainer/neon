---
description: Run this change's definition of done and read the result honestly
allowed-tools: mcp__neon__neon_check, Bash, Read
---

# Check

Find the active change (`neon status` if you do not have the id) and call
`neon_check` with it, passing the current HEAD sha as `config_commit` so the run
can be cited later.

Present the result in a few lines:

- pass or fail, per check, with the failure summary or threshold violation
- the run id for each, and whether it is citable

If it passed, say so and stop. Do not congratulate anyone.

If it failed:

- **Say what actually failed**, in the check's own words. Do not restate it as
  something more comfortable.
- Distinguish a failure from an error. `fail` means the work does not meet the
  bar; `error` means the check could not run, which is a different problem and
  usually not the work's fault.
- If a threshold was violated, give the number and the bar.
- Then fix the work. Do not adjust the `done_when` to make it pass — the bar is
  the work order's, and changing it is a conversation with a person, not a
  workaround.

A run that is not citable can still gate this work; it just cannot be attached
to a decision as evidence later. If someone will want to cite this result,
record the artifact version and config commit now rather than re-running it in
a fortnight.
