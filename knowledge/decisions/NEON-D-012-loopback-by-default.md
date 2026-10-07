---
key: NEON-D-012
title: The service and its Postgres listen on loopback unless told otherwise
state: proposed
decided_at: 2026-10-07
author: Claude Code, working from Caleb's brief; awaiting Caleb's confirmation
components: [service]
evidence_runs: []
---

## Rationale

The service has no authentication, and its `command` check adapter runs shell
commands from a repo's `neon.checks.yaml` on the machine it runs on. It listened
on `0.0.0.0`, so anyone on the same network could register a repo with a check
of their choosing and ask the service to run it. Compose published Postgres on
every interface too, with the password `neon`.

Both now bind `127.0.0.1` by default. `NEON_HOST` changes the service's address,
and a non-loopback value logs a warning that says plainly what it exposes. This
landed before the service was first started for real use, because starting it
first would have exposed it. Checked with `netstat` and by requesting the
machine's LAN address, which no longer answers.

## Rejected alternatives

### Keep 0.0.0.0 and rely on the host firewall

Rejected because the firewall is not this project's to configure and differs on
every machine, and Docker Desktop opens its own rules for published ports. A
safe default should not depend on someone else's configuration being right.

### Bind `localhost` and let Fastify listen on both loopback families

Considered, and it would also be safe. `127.0.0.1` was chosen because it is the
explicit value asked for, and Node's fetch reaches it through `localhost` anyway
(checked on this machine with Node 22).

### Add authentication first, then bind wherever

Rejected as the wrong order. Authentication is a project (D-002 defers GitHub
OAuth); a loopback default is one line and is right whether or not
authentication ever arrives.

## What would change this

A deployed, shared instance. That needs authentication, and the command adapter
moved off the service host into isolated runners, before any address other than
loopback is reasonable.
