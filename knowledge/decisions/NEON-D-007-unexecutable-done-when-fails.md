---
key: NEON-D-007
title: A done_when clause naming a check that does not exist fails the work
state: accepted
decided_at: 2026-08-08
author: caleb
components: [service, plugin]
evidence_runs: []
---

## Rationale

Found while smoke-testing the Stop hook, which is the only reason it is written
down: a `done_when` clause naming an unregistered check made the whole check
call return an error, the hook read that as "cannot tell", and stood aside. A
typo in a definition of done silently waved the work through — the precise
failure the hook exists to prevent.

The rule now: a clause that cannot be executed comes back as a failed result
with no run attached, and the report as a whole does not pass. Clauses that can
run still run, so the report says everything that is wrong at once rather than
one thing per attempt.

The hook keeps its own rule — an API error means stand aside — because a hook
that blocks when it is confused gets uninstalled. The two only work together if
"the check is missing" is a result rather than an error.

## Rejected alternatives

### Let the call fail with an error status

Rejected: it is technically accurate and operationally backwards. It makes an
unexecutable definition of done indistinguishable from Neon being down, and the
correct response to those two is opposite.

### Skip clauses that cannot resolve

Rejected outright. That is a definition of done that quietly shrinks to the
checks that happen to exist, which is worse than having none.

### Refuse to save a `done_when` naming an unknown check

Rejected as too strict in the wrong place: work orders outlive check
registrations, checks are declared per repo, and a work order written before its
repo is registered is a normal thing. Validate at execution, where the answer is
knowable.

## What would change this

Nothing foreseeable. If check declarations ever become global rather than
per-repo, validating at write time becomes possible — but the execution-time
check should stay anyway.
