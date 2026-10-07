---
key: NEON-D-004
title: Drizzle with plain-SQL migrations, not Prisma
state: accepted
decided_at: 2026-08-08
author: caleb
components: [service]
evidence_runs: []
---

## Rationale

The schema is the artifact under the most churn in this phase, and several of
its invariants are things an ORM's abstraction actively gets in the way of:
citability derived on write, partial indexes, trigram indexes for duplicate
detection, and an events table written in the same transaction as its
projection.

Drizzle keeps migrations as readable SQL files we own, lets us drop to raw SQL
where the query is the interesting part (similarity search, recurring-friction
aggregation), and infers types from the schema without a code generation step in
the middle.

## Rejected alternatives

### Prisma

Rejected because its migration output is generated and its escape hatch
(`$queryRaw`) returns untyped rows — which is precisely where the interesting
queries live here. The generated client is also a build step between editing the
schema and running a test, on the file that changes most.

### Raw `pg` with hand-written query functions

Rejected as too far the other way. No type inference across a fifteen-table
schema means the compiler stops helping exactly when a field is renamed, which
is the change we expect to make repeatedly.

## What would change this

Nothing likely. If Drizzle's migration story becomes a problem the migrations
are plain SQL and portable to any runner, which is most of the reason for
choosing it.
