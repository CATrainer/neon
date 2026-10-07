---
description: Sync the record, record completion, and draft the artifacts for review
allowed-tools: mcp__neon__neon_check, mcp__neon__neon_finish_work, mcp__neon__neon_propose, Bash, Read, Write, Edit
---

# Finish

## 1. Check first

Call `neon_check`. If it fails, stop here and fix the work — finishing is not a
state you can talk your way into.

## 2. Sync the record to what actually happened

- **Code work:** update the OpenSpec change folder so the spec deltas describe
  what the diff does, not what the plan said it would do. Where they differ, the
  diff is the truth and the delta is the thing to correct.
- **Inquiry work:** complete the record — the analysis, the alternatives
  considered *with the reason each was rejected*, the recommendation, and what
  evidence would change the conclusion. A record with no rejected alternative is
  usually a record of a decision nobody actually made.

## 3. Record completion

Call `neon_finish_work` with a summary of what changed and why. It returns
drafts: a PR body citing the runs, and a commit trailer.

## 4. Decisions

Look at what you just did. If any of it was a judgment call — a shape chosen
over an obvious alternative, an invariant that must now hold, a constraint
discovered the hard way — record it with `neon_propose(kind: "decision")`,
including what was rejected and why it was rejected.

Be honest about the threshold here: most changes contain no decision worth
recording, and inventing one pollutes the corpus for everyone. But a decision
that is not recorded will be re-litigated in four months by someone with no
memory of this conversation, and the code will not tell them why.

## 5. Commit and open the PR

- Commit with the returned trailer (`Neon-Work-Order: KEY`) in the message. That
  trailer is how this work is traced back without Neon.
- Open the PR with `gh pr create` if the CLI is available, using the drafted
  body. If it is not, print the body for the person to paste.

Present the drafts for editing before writing anything. They are drafts on
purpose: what Neon generates is always a proposal for a human to confirm.
