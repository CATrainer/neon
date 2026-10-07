# Knowledge

Decisions made while building Neon, recorded as they were made — including the
ones settled before any code was written.

This is not ceremony. In four months an agent with no memory of these
conversations will confidently propose an approach that was already considered
and rejected, and the code will not record why. It is also the first real test of
whether the record format is any good: if writing one of these is annoying, the
format is wrong, and better to find that out on ourselves.

These live here until the service can hold them, then get imported. Neon will
store the reference and a content hash — the text stays in git.

## Format

The `schema` check adapter reads exactly this shape, so it is worth keeping:

```markdown
---
key: NEON-D-011
title: One sentence, the decision itself
state: proposed | accepted | contested | superseded
decided_at: YYYY-MM-DD
author: someone
components: [service, cli]
evidence_runs: []
---

## Rationale

Why this shape and not the obvious one.

## Rejected alternatives

### The obvious one

Why it was rejected. Be specific about the *constraint* — corpus size, latency
budget, team size, what the model could do at the time. Constraints expire, and
the whole generative side of Neon depends on someone later being able to tell
whether this one still holds.

## What would change this

The evidence or the change in circumstance that would reopen it. A decision with
no answer here is usually a preference wearing a decision's clothes.
```

A record with no rejected alternative is usually a record of a decision nobody
actually made, which is why the check refuses it.
