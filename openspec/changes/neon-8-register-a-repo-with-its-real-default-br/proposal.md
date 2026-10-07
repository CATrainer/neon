# NEON-8: Register a repo with its real default branch

## Why

`neon repo register` records whatever branch is checked out as the repo's
default branch. Registering mirage from `demo-prep` would make `neon reconcile`
diff against `demo-prep` instead of `main`. Git already knows the answer in
`origin/HEAD`. Found while onboarding mirage.

## Acceptance criteria

- `neon repo register` uses `origin/HEAD` when it is set.
- It falls back to the current branch only when `origin/HEAD` is unset, and
  `--default-branch` overrides both.
- A test covers both cases against real git repositories.
