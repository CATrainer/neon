# NEON-10: Record the decisions made outside the loop tonight

## Why

Three decisions were made on 2026-10-07 with real rejected alternatives and no
record. Two were bootstrap commits made before the loop was running (found by
`neon reconcile --since bb0120f`: 007533d, 37d7ece, 5c067e5, 0435018); one was
the judgment call inside NEON-2.

## Acceptance criteria

- NEON-D-010, NEON-D-011 and NEON-D-012 exist in `knowledge/decisions`, each
  with rejected alternatives and what would change it.
- Each passes the `record.schema` check.
- They are marked `proposed` until Caleb confirms them.

Note: this is record-producing work done as a `code` work order, because the
knowledge records live inside this code repo and Neon refuses inquiry work
against a code repo.
