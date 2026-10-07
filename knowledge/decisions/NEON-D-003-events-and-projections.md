---
key: NEON-D-003
title: Mutations write an append-only event beside the projection they update
state: accepted
decided_at: 2026-08-08
author: caleb
components: [service]
evidence_runs: []
---

## Rationale

The local-first principle requires that state producible offline merges rather
than conflicts. Full event sourcing — projections rebuilt from a log, no
authoritative rows — is the honest version of that, and is far more machinery
than this phase can justify.

What we do instead: every domain mutation writes an `events` row (ULID,
kind, subject, payload, actor, source, occurred_at, idempotency key) in the same
transaction as the projection row it updates. Ids are client-generatable, so a
record created offline keeps its identity when it reconciles, and replaying a
batch of events is idempotent.

That gives us the property that matters now — offline work merges instead of
conflicting — and leaves the door open to rebuilding projections from the log
later, without paying for it today.

## Rejected alternatives

### Mutable rows only, reconcile by last-write-wins

Rejected because it loses information exactly where the system's value is. Two
people capturing ideas offline is the normal case, and last-write-wins on a
funnel silently deletes half of it.

### Full event sourcing, projections derived only

Rejected as disproportionate for a four-person team's first phase. Every query
would go through a projection layer we would be maintaining by hand, and the
schema is still moving weekly.

## What would change this

If reconciliation turns out to need replay from an arbitrary point — merge
semantics across a multi-day offline period, which is Phase 2's E2 — the log is
already there and the projections become derived. That is the upgrade path this
shape was chosen to keep.
