---
description: Sync the record, record completion, and draft the artifacts for review
allowed-tools: mcp__neon__neon_check, mcp__neon__neon_finish_work, mcp__neon__neon_propose, Agent, Task, Bash, Read, Write, Edit
---

# Finish

## 1. Check first

Call `neon_check` with the current HEAD sha as `config_commit`. If it fails,
stop here and fix the work — finishing is not a state you can talk your way
into, and `neon_finish_work` will refuse anyway.

## 2. Sync the record to what actually happened

- **Code work:** update the OpenSpec change folder so the spec deltas describe
  what the diff does, not what the plan said it would do. Where they differ, the
  diff is the truth and the delta is the thing to correct.
- **Inquiry work:** complete the record — the analysis, the alternatives
  considered *with the reason each was rejected*, the recommendation, and what
  evidence would change the conclusion. A record with no rejected alternative is
  usually a record of a decision nobody actually made.

## 3. Optionally, a review in fresh context

The checks say the work passes; they do not say it does what was asked. If
the change is more than a few lines, or touches something the acceptance
criteria care about, offer to run the `neon-reviewer` subagent: give it the
work order's intent and acceptance criteria and the diff (`git diff` against
the base branch), and nothing else. It has not seen this conversation, which is
the point.

Skip it for trivial changes, and say you skipped it. If it reports findings,
show them to the person as they are and let them decide; do not quietly fix
things and carry on. "No findings" is a complete answer.

## 4. Record completion

Call `neon_finish_work` with a summary of what changed and why, and the same
`config_commit`. It runs nothing: it judges the runs `neon_check` just recorded,
and refuses if any of them fails, is missing, or was made at another commit.
It returns drafts: a PR body citing those runs, and a commit trailer.

If it refuses, there is no way round it from here, by design. If the person
decides the work should finish anyway — a flaky dependency, a check that is
itself wrong — tell them it is their call and the command is theirs to run in
a terminal: `neon finish --override "<reason>"`. Do not run it yourself; it
asks for the work order key at an interactive prompt, and the reason is
recorded.

## 5. Decisions

Look at what you just did. If any of it was a judgment call — a shape chosen
over an obvious alternative, an invariant that must now hold, a constraint
discovered the hard way — record it with `neon_propose(kind: "decision")`,
including what was rejected and why it was rejected.

Be honest about the threshold here: most changes contain no decision worth
recording, and inventing one pollutes the corpus for everyone. But a decision
that is not recorded will be re-litigated in four months by someone with no
memory of this conversation, and the code will not tell them why.

## 6. Commit and open the PR

- Commit with the returned trailer (`Neon-Work-Order: KEY`) in the message. That
  trailer is how this work is traced back without Neon.
- Open the PR with `gh pr create` if the CLI is available, using the drafted
  body. If it is not, print the body for the person to paste.

Present the drafts for editing before writing anything. They are drafts on
purpose: what Neon generates is always a proposal for a human to confirm.
