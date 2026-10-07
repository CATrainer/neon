---
description: Claim a work order, scaffold its record, and load its context pack
argument-hint: <work-order-key>
allowed-tools: mcp__neon__neon_start_work, mcp__neon__neon_get_context, Bash, Read, Write
---

# Start work on $ARGUMENTS

## 1. Claim it

Call `neon_start_work` with the key. It returns the branch name, the path where
this change's record belongs, and whether you are resuming an existing claim.

If it refuses because the work order is still a draft, stop and say so: a draft
has no executable definition of done, and claiming it would mean agreeing to
something nobody has stated. Offer to draft a `done_when` with the person
instead.

## 2. Set up the working tree

- `git checkout -b <branch>` (or check it out if it already exists)
- **Code work:** create the OpenSpec change folder at the returned path, with a
  `proposal.md` holding the intent and acceptance criteria from the pack, and
  the spec deltas left as headings to fill in.
- **Inquiry work:** create the record at the returned path — the question being
  answered, what would settle it, and empty sections for the analysis, the
  alternatives considered, and the recommendation. Inquiry work produces
  records, not commits; the machinery is otherwise identical.

## 3. Load the context

Call `neon_get_context` with the same key and present it as a short brief, not a
dump. In this order:

1. **What we're doing and why** — the intent, in the work order's own words.
2. **Done means** — the `done_when` list, plainly. This is what will be run
   against the work, and the Stop hook will run it whether or not it is
   mentioned here.
3. **Constraints that apply** — each decision with the reason it was included.
   Say which component it constrains. If a decision is contested, say so and
   give both positions: an unsettled question presented as settled is worse than
   silence.
4. **Contracts you must not break** — publishers and consumers.
5. **Worth knowing** — related recent work, open questions.

If the pack reports omissions or notes, say so in one line. A pack that dropped
items is not a complete picture, and the agent reading it should know that.

Then stop and wait. Do not start editing files in the same turn as claiming the
work.
