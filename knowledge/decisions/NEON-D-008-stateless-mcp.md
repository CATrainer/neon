---
key: NEON-D-008
title: The MCP endpoint is stateless — a server and transport per request
state: accepted
decided_at: 2026-08-08
author: caleb
components: [service]
evidence_runs: []
---

## Rationale

Every tool call is a complete unit of work against the database: it reads or
writes rows and returns. There is nothing to keep between calls, so a session
would be a thing to create, expire, and debug in exchange for nothing.

It also gives a property worth having: an agent whose connection drops
mid-task loses nothing, because there was nothing on the server to lose. That
matters for a local-first system where the service is expected to be
occasionally unreachable.

`GET /mcp` and `DELETE /mcp` answer 405 rather than pretending: in stateless
mode there is no server-initiated stream and no session to delete.

## Rejected alternatives

### Session-per-connection with `sessionIdGenerator`

Rejected because it buys server-initiated notifications we do not send, and
costs session lifecycle, expiry, and a class of "your session is gone" errors
that would arrive precisely when someone's laptop woke up.

## What would change this

Server-initiated notifications — Neon telling a connected agent that a check it
started has finished, or that its work order was claimed by someone else. That
would need a session, and it is the thing to reopen this for.
