---
description: File an idea in one move — no questions, no required fields
argument-hint: [what you were thinking, or nothing to infer it]
allowed-tools: mcp__neon__neon_propose
---

# Capture

File `$ARGUMENTS` as an idea.

If there are no arguments, infer the idea from what this session has just been
discussing — the half-formed thought that prompted the command, not a summary of
the whole conversation.

Then call `neon_propose` with `kind: "idea"`, a title of at most a dozen words
and a body of two or three sentences in the person's own framing.

**Do not ask any questions before capturing.** Not about the component, not
about the repo, not about whether it is worth doing. An idea needs a title and a
body and nothing else; anything more is friction at the exact moment friction is
most expensive. If the thought is vague, capture it vague.

Then report, in no more than a few lines:

- the idea id, and when it expires unless someone touches it
- **any prior rejection**, quoted with the reason it was rejected. This is the
  point of the whole exercise: either the constraint still holds and the person
  just saved themselves the work, or it has expired and they now have a much
  better idea than the one they walked in with. Do not soften it or bury it
  under the close matches.
- close matches among open ideas, as one line each

Do not offer to promote it, plan it, or start work on it. Capture is finished
when the idea is filed.
