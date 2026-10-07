# Neon — working agreements

Cross-tool source of truth. Tool-specific configuration stays out of this file;
`CLAUDE.md` imports it and adds nothing but the import.

## What this is

An engineering platform for teams where most code is written by AI agents. It
serves bounded context to coding agents over MCP, makes "done" machine-checkable,
records decisions with their evidence, and captures ideas at low friction.

## Principles — not negotiable

**Never store what git can answer.** File contents, spec text, commit metadata,
PR state, branch existence: all derived, never mirrored. Neon stores references
and content hashes for staleness detection. If Neon holds the only copy of
something, that's a bug.

**No domain-specific concepts in the core schema.** Neon must be usable by any
AI-native engineering team. Every pluggable seam — check kinds, provisioners,
evidence kinds — is an adapter with a declared interface.

**Local-first with reconciliation.** State that can be produced offline is
written as append-only events that merge, not mutable rows that conflict. Only
resource claims require connectivity.

**Small, stable MCP surface.** Seven tools, fixed. Dynamically varying tool
definitions breaks prompt caching.

**A run without complete version pins is not citable as evidence.** Enforced in
the citability derivation, not by convention.

**Findings from automated analysis are proposals for human confirmation, never
automatic mutations.** Nothing Neon generates is ever auto-committed.

## Layout

| Path             | What lives there                                          |
| ---------------- | --------------------------------------------------------- |
| `packages/core/` | Domain types and zod schemas shared by service, cli, ui    |
| `service/`       | Fastify: REST API, MCP endpoint, checks, context assembly  |
| `cli/`           | `neon` — thin wrapper on the API, for CI and the plugin    |
| `plugin/`        | Skills, hooks, subagents, MCP registration                 |
| `infra/`         | docker-compose, provisioner stacks                         |
| `knowledge/`     | Decision records as markdown, until the service holds them |
| `ui/`            | Filament design prototype — not wired up, do not touch     |

`ui/` is intentionally outside the npm workspace: it has its own lockfile and
toolchain and is a design artifact, not part of the service build.

## Conventions

- TypeScript, ESM, Node 22. `strict` on; no `any` without a comment saying why.
- Comments explain why, not what. Assume the reader can read the code.
- Tests live beside the code as `*.test.ts`. Integration tests needing Postgres
  live in `service/test/integration/` and are excluded from `npm test`.
- Migrations are plain SQL under `service/src/db/migrations`, applied in order,
  never edited once committed.
- Every domain mutation goes through a domain service that writes an `events`
  row in the same transaction as the projection it updates. Do not write to
  projection tables directly from a route.

## Commands

```
npm run db:up        # compose Postgres on 5433
npm run db:migrate   # apply migrations
npm run seed         # synthetic corpus: code repo + knowledge repo
npm run dev          # service on :4000
npm test             # unit
npm run test:integration
npm run typecheck
```

The CLI runs from the repo without installing: `node cli/bin/neon.js <command>`.
`neon capture`, `neon inbox`, `neon status`, `neon check`, `neon promote`,
`neon rules`, `neon reconcile`, `neon repo register`, `neon checks sync`.

## Recording decisions

Decisions made while building this are recorded as they are made, with the
rejected alternative and the reason it was rejected. Until the service can hold
them they live in `knowledge/decisions/`. This is not ceremony: in four months
an agent with no memory of these conversations will confidently propose an
approach that was already considered and rejected, and the code will not record
why.
