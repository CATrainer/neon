# Neon plugin

Everything a developer needs, installed once at user scope and working in every
repo: the MCP registration, the commands, the hooks, and a reviewer.

## Install

From this repo:

```
/plugin marketplace add <path-or-remote>/neon
/plugin install neon
```

Point it at a service with `NEON_URL` (defaults to `http://localhost:4000`).
Inside this repo, a project-scoped `.mcp.json` points at localhost; at user
scope it points at the deployed instance. Local wins here, deployed everywhere
else.

## Commands

| Command            | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `/neon:capture`    | File an idea. No questions. Returns prior rejections immediately. |
| `/neon:ideate`     | Divergent session over rejected alternatives and open tension.    |
| `/neon:promote`    | Draft a work order from an idea; a human confirms it.             |
| `/neon:start`      | Claim work, scaffold its record, load the context pack.           |
| `/neon:check`      | Run the definition of done and read the result honestly.          |
| `/neon:finish`     | Check, optional fresh-context review, record completion, drafts.  |
| `/neon:reconcile`  | Draft what should have existed for work done outside Neon.        |

All of them work for both kinds of work order. `/neon:start` on an `inquiry`
work order scaffolds a record in the knowledge repo instead of a code branch,
and `/neon:finish` produces decision records instead of a PR body — same
commands, same flow.

## Hooks

- **Stop** — runs the active change's `done_when`. Exit 2 with the failure, so
  the agent keeps working instead of declaring victory. It keeps doing so within
  a turn while the checks still fail, but never loops forever: it stands down
  after three consecutive blocks (and says so), and whenever it cannot tell
  what is going on. A pass resets the count.
- **PreToolUse** on Write/Edit — denies writes to `protected_paths` from
  `neon.yaml`, and in every repo to `.neon/**` and Claude Code's settings
  files. On Bash — denies commands that name `.neon/` or a settings file.
- **PostToolUse** on Write/Edit — runs the repo's formatter and linter. Never
  blocks; lint is enforced by the definition of done, not by a hook.
- **SessionStart** — one line if this branch has claimed work.

Override the Stop hook deliberately by launching Claude Code with
`NEON_SKIP_CHECKS=1` in its environment (`NEON_SKIP_CHECKS=1 claude`). That is
the only override: the agent's shell commands run in child processes and cannot
change the environment the hooks inherit, and the files that could (Claude
Code's settings) are protected. It is meant to be a decision someone makes, not
one the agent can make for itself — see `knowledge/decisions/NEON-D-009`. It is
a guardrail against an agent talking itself past the gate, not a sandbox
against one working to escape it.

## Rules generated from decisions

`neon rules` shows what should change in this repo's path-scoped rule files;
`neon rules --write` writes it to the working tree and stops there. Nothing is
committed, ever — the diff is the point, because it is where a human confirms
what Neon proposes.

A constraint carried by a rule is deliberately left out of the context pack: the
rule loads itself when the agent touches the files it governs, and repeating it
in the pack would spend budget to dilute what is left.

## Repo configuration

`neon.yaml`, at the repo root:

```yaml
protected_paths:
  - "infra/**"
  - ".github/workflows/**"
format:
  command: npm run format --
lint:
  command: npm run lint
```

`neon.checks.yaml` declares the checks a work order's `done_when` can name. See
the one in this repo.
