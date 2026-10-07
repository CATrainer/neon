# NEON-3: Look up the active change by branch on the server

## Why

The hooks and the CLI find the live change for a checkout by listing
`/api/changes` and filtering on the client, which only ever sees the 100 newest
changes. In a busy repo the Stop hook would silently stop finding the work it is
meant to gate — and "cannot tell" means it stands aside. `findActiveChangeForBranch`
already answers the question and nothing calls it.

## Acceptance criteria

- `GET /api/changes/active?repoId=&branch=` returns the live change for that
  branch and its work order, or nulls.
- The hooks and the CLI use it instead of listing changes.
- A test shows a live change older than the 100 newest is still found.

## What changes

- `service/src/http/routes/changes.ts`: the endpoint, backed by
  `findActiveChangeForBranch`.
- `plugin/hooks/lib.mjs` and `cli/src/context.ts`: one call instead of a list
  and a second lookup for the work order.
- Tests: integration (over 100 changes) and the hook tests' fake service, which
  no longer answers the list endpoint at all.
