---
key: NEON-D-006
title: Promotion is a CLI command, not the eighth MCP tool
state: accepted
decided_at: 2026-08-08
author: caleb
components: [service, cli, plugin]
evidence_runs: []
---

## Rationale

The MCP surface is seven tools and stays seven. Two reasons, and the second is
the load-bearing one.

The mechanical reason: a small, fixed tool set keeps prompt caching intact.
Tools that vary per repo or per session invalidate the cache for every agent
that connects.

The real reason: promotion is the ladder's gate. It is the point where a
half-formed thought becomes something the team has agreed is worth doing, and
that agreement is a person's to give. An agent that can promote its own ideas
turns the funnel into a pipe. So `/neon:promote` drafts the intent, the
acceptance criteria and the `done_when` into a file, shows it, and then a human
runs `neon promote <id> --file <draft>`.

The same reasoning keeps `done_when` editing off the MCP surface: an agent that
can lower the bar it is being held to is not being held to a bar.

## Rejected alternatives

### A `neon_promote` MCP tool

Rejected because it is one tool call away from an agent capturing an idea and
promoting it in the same turn, which is a funnel with no gate. The friction here
is the feature.

### Tools generated per repo from its registered checks

Rejected: it would give better autocomplete for `done_when` and break prompt
caching for everyone, permanently, in exchange.

## What would change this

If drafting-then-confirming turns out to be so tedious that people stop
promoting ideas at all, the answer is a better draft, not a tool that skips the
human.
