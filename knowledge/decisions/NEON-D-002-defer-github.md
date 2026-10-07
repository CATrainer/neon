---
key: NEON-D-002
title: GitHub integration is deferred past the bootstrap point
state: accepted
decided_at: 2026-08-08
author: caleb
components: [service]
evidence_runs: []
---

## Rationale

The build order puts OAuth and the GitHub App at step 2, but the milestone that
proves the design is step 4 — the full loop end to end. Nothing in that loop
needs GitHub: a repo can be registered from its local git remote, a single local
user can stand in for auth, and Change state can be driven locally by branch and
claim rather than by webhooks.

Registering the App is also human work in a browser — App creation, secrets, a
webhook tunnel — and it would sit between us and the thing we actually want to
judge.

The cost of deferring is only paid if the deferral is sloppy, so it isn't:
`AuthProvider` and `GitHubProvider` exist as interfaces from the start with
local and stub implementations behind them, and the encrypted `secrets` table is
built now so no code path ever learns to write a token in plain text.

## Rejected alternatives

### Build GitHub at step 2 as the brief sequences it

Rejected because it delays the only milestone that can invalidate the design.
If the loop feels wrong, everything built before finding that out is wasted, and
GitHub is the largest block of work that the loop does not depend on.

### Skip the provider interfaces and add GitHub directly later

Rejected because that is how a stub becomes load-bearing. Without the seam, PR
state and commit statuses get read straight out of route handlers and the local
instance — which must run with no GitHub connection at all — quietly stops
working.

## What would change this

Nothing about the loop. This gets picked back up as soon as step 4 has been used
for real work, because merge gating is what makes Neon load-bearing and it needs
commit statuses.
