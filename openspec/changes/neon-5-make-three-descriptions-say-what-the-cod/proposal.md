# NEON-5: Make three descriptions say what the code does

## Why

An agent reads tool descriptions and comments as fact. `neon_check`'s
description says the Stop hook calls it, a CLI comment says the Stop hook reads
`neon check`'s exit codes, and `attachEvidence` promises to name the missing pin
but returns a generic refusal. Each sends the next reader the wrong way.

## Acceptance criteria

- `neon_check`'s description says the Stop hook runs the same check through the
  REST API.
- The CLI check comment says who reads its exit codes.
- Refusing a non-citable run as evidence names each missing pin, using
  `citabilityGaps`.
- A test asserts the named pins.
