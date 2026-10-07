---
key: NEON-D-001
title: The service is TypeScript on Fastify, not Python on FastAPI
state: accepted
decided_at: 2026-08-08
author: caleb
components: [service, cli, packages/core]
evidence_runs: []
---

## Rationale

The build brief left the choice open provided we were consistent. TypeScript
wins on a specific, concrete ground rather than taste: the UI prototype already
carries a schema-faithful set of domain types in `ui/src/fixtures/types.ts`, and
in TypeScript those become one shared `packages/core` consumed by the service,
the CLI and the UI. In Python they would become a second, hand-maintained copy
of the schema that drifts the first time a field is added.

Secondary: one toolchain and one lockfile for the whole repo; the MCP TypeScript
SDK is first-party and tracks the Streamable HTTP transport closely; the CLI and
the service share validation code rather than re-implementing it.

## Rejected alternatives

### Python + FastAPI

Rejected because it buys in-process access to Python ML tooling that this phase
does not use, at the cost of a second toolchain and a duplicated schema. The
evaluation and fixture work in Phase 2 is the case for Python — but check
adapters run out of process by design (`command` shells out), so a Python eval
runner can be added later without the service being Python.

### Split: Python service, TypeScript MCP layer

Rejected outright. Two languages for one small system, and the seam would fall
in the worst possible place — between the API and the tool surface, which share
the most types.

## What would change this

If the eval harness needs to run in-process against the corpus with Python
libraries and the out-of-process runner turns out to be the wrong seam, this is
worth reopening. The adapter interface is the thing to look at first.
