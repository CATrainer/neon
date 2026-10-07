---
key: NEON-D-011
title: Real usage lives in its own database, and the seed refuses any database that has been used
state: proposed
decided_at: 2026-10-07
author: Claude Code, working from Caleb's brief; awaiting Caleb's confirmation
components: [service]
evidence_runs: []
---

## Rationale

The seed fixture is fiction: invented people, invented repos, decisions nobody
made. It exists to exercise every path, and it wipes its target first. Real use
of Neon on its own development has to be kept apart from it, both so a demo
reseed cannot destroy real records and so fictional data is never mistaken for
usage.

Real usage lives in a second database on the same compose Postgres
(`neon_real`, named in a gitignored `.env`); the fixture stays in `neon`. A name
alone does not protect anything, though: with `.env` loaded, a stray
`npm run seed` targets whatever `DATABASE_URL` says. So the seed checks the
content. The fixture writes no events and every real domain mutation writes
one, so a database with any event in it has been used, and the seed refuses it
unless given `--force`. It also prints the database it is about to seed.

This depended on a bug fix found while setting it up: the service's `.env` was
loaded relative to the working directory, and npm workspace scripts run in
`service/`, so the root `.env` had never been read by `dev`, `migrate` or `seed`.

## Rejected alternatives

### A separate Postgres schema in the same database

Rejected because Drizzle's table definitions and the migration runner are
written against the default schema; making both schema-aware is a larger change
than a second database, which needs no code at all.

### Guard the seed by database name

Rejected because a name is a convention, and conventions are what get broken at
one in the morning. A database called `neon` can hold real work if someone
points the default at it; an events count cannot be fooled that way.

### A second compose service for real data

Rejected as more moving parts for no added isolation: one Postgres, two
databases, is already separate at every level that matters here.

## What would change this

Real usage that writes no events (an import path that bypasses the domain
functions would be a bug, but would defeat the guard), or a hosted instance
where the fixture never runs at all.
