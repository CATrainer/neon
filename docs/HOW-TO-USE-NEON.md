# How to use Neon

For daily use, on your own machine. Setup is in the README; this is the
workflow.

`neon` below means `node cli/bin/neon.js` run from this repo, or an alias for
it. Run it from inside the repo you are working on: it works out which repo and
branch you are on from git.

---

## 1. The daily loop, command by command

### Before you start

```
npm run db:up            # in the neon repo: Postgres
npm run dev              # in the neon repo: the service on 127.0.0.1:4000
neon status              # in the repo you're working on
```

`neon status` tells you whether the repo is registered, which branch you're on,
and whether work is claimed on it.

### Capture: the moment you have an idea

```
neon capture "Cache context packs per commit
Assembly reruns on every call even when nothing changed."
```

The first line is the title; anything after a line break is the body. No other
field is asked for. Neon answers immediately with:

- the idea's id and when it will silently expire (60 days untouched);
- **anything like it that was already rejected, and why.** Read that first.
  Either the reason still holds and you've saved yourself the work, or it has
  expired and you now have a better idea;
- open ideas that look similar.

In Claude Code: `/neon:capture <text>`, or just `/neon:capture` to capture what
you were just discussing.

### Review what you've captured

```
neon inbox            # open ideas, the ones expiring soonest first
neon inbox --all      # including promoted and expired
```

Leaving an idea to expire is a valid decision. Nothing nags.

### Promote: decide it's worth doing

Promotion turns an idea into a work order and is **your** decision, not the
agent's. In Claude Code, `/neon:promote <idea-id>` drafts the work order as JSON
in the conversation and stops. When you're happy with it:

```
neon promote <idea-id> <<'EOF'
{
  "kind": "code",
  "title": "Look up the active change by branch on the server",
  "intent": "The problem, in a sentence or two. Not the solution.",
  "acceptanceCriteria": ["something a person could disagree with", "..."],
  "doneWhen": [{ "check": "typecheck" }, { "check": "tests.unit" }],
  "repoId": "<from GET /api/repos>",
  "state": "ready"
}
EOF
```

Leave out `doneWhen` (or set `"state": "draft"`) if you can't yet say what done
means; a draft cannot be claimed, which is the right outcome.

### Start: claim it and load context

In Claude Code: `/neon:start NEON-12`. It:

1. calls `neon_start_work`, which returns the branch name and the spec path;
2. checks out **exactly** that branch (see common mistakes);
3. scaffolds `openspec/changes/<name>/proposal.md` with the intent and criteria;
4. calls `neon_get_context` and presents the brief: intent, done means, the
   decisions that constrain this code and why, contracts, related work.

Then it stops before editing anything.

### Work

The hooks do their jobs in the background:

- **PreToolUse** denies edits to protected paths (from `neon.yaml`, plus `.neon/`
  and Claude Code's settings files everywhere) and shell commands that name them.
- **PostToolUse** runs the repo's formatter on the edited file and its linter.
- **SessionStart** reminds a new session what the branch is claimed for.

### Check

```
neon check
```

or `/neon:check`. It runs every `done_when` check against your checkout and
records a run for each, pinned to the current HEAD commit. Exit code 0 passed,
1 failed, 2 nothing to check, 3 Neon unreachable.

**Commit before you check** if you want the runs to describe exactly what you're
finishing: the pin is the HEAD commit, not your uncommitted edits.

When the agent tries to end its turn, the **Stop hook** runs the same checks and
sends it back to work if they fail. That happens at most three times in a row
per session, and only if it can tell what's going on.

### Finish

```
neon finish --summary "What changed and why, in a sentence or two."
```

or `/neon:finish`, which also offers a fresh-context review by the
`neon-reviewer` subagent and drafts a PR body and decision candidates.

Finishing **runs nothing**: it looks at the latest run of each check on this
change and refuses if any is missing, failing, or (when it knows the commit) from
a different commit. Fix the work and `neon check` again.

If you, the person, decide it should finish anyway (a flaky upstream, a check
that is itself wrong), run this yourself in a real terminal:

```
neon finish --override "Sandbox outage; verified the payment path by hand."
```

It asks you to type the work order key. The reason is recorded. The agent can't
do this: its shell has no terminal, and the MCP tool has no override.

### Land it

1. Commit with the trailer the finish printed: `Neon-Work-Order: NEON-12`. It is
   how anyone can trace a commit back to its work order without Neon.
2. Merge (or open a PR with the drafted body).
3. Mark the work order done. There is no CLI command for this yet, so use the
   API with the work order's id (not its key):

   ```
   curl -s http://127.0.0.1:4000/api/work-orders/NEON-12          # find "id"
   curl -s -X PATCH http://127.0.0.1:4000/api/work-orders/<id> \
        -H 'content-type: application/json' -d '{"state":"done"}'
   ```

   (Once the GitHub App exists, merging would drive this. It doesn't yet.)

### Record decisions as you make them

If the work involved a real choice, with an alternative you considered and
rejected, write a record in `knowledge/decisions/` (section 3) and load it:

```
neon import knowledge/decisions/NEON-D-013-your-decision.md
```

It arrives as `proposed`. Use `--as-recorded` only for a record you have
actually accepted; it keeps the record's own `state` and `decided_at`.

### Work done outside Neon

```
neon reconcile --since <base-ref>
```

lists commits with no `Neon-Work-Order` trailer. `/neon:reconcile` goes further:
it reads the diff and drafts the work order and decisions that should have
existed. Bypassing Neon is allowed; letting the record become fiction isn't.

### Other commands

| Command | Use |
| --- | --- |
| `/neon:ideate [focus]` | A deliberate divergent session over rejected alternatives, contested decisions, recurring friction and ageing ideas |
| `neon rules` / `neon rules --write` | See, then write to the working tree, the path-scoped `CLAUDE.md` rules generated from decisions. Never commits |
| `neon checks sync` | After editing `neon.checks.yaml` |
| `neon run record <check> --result pass ...` | Record a run that happened elsewhere (CI uses this) |
| `neon import <file> --dry-run` | See what an import would create |

---

## 2. Writing a good `done_when`

`done_when` is a list of checks the repo has declared in `neon.checks.yaml`.
A good one has three properties:

1. **It fails when the work is wrong.** A `done_when` of only `noop` always
   passes; it proves the loop works, nothing else.
2. **It runs offline, quickly and repeatably.** The Stop hook runs it every time
   the agent tries to stop. A check that calls a paid API, needs a VPN, or takes
   ten minutes will get overridden, and then it's a ritual. Put slow or online
   checks in CI instead.
3. **It names the specific thing at risk**, using parameters, where the repo
   supports it.

Examples, from real use:

```json
[{ "check": "typecheck" }, { "check": "tests.unit" }, { "check": "tests.integration" }]
```

Normal code work in this repo (NEON-1 to NEON-9).

```json
[
  { "check": "record.schema", "params": { "path": "knowledge/decisions/NEON-D-010-finish-is-judged-on-latest-runs.md" } },
  { "check": "tests.unit" }
]
```

Work whose output is a record (NEON-10). The `schema` check fails until the file
exists and has a rationale, at least one rejected alternative, and components.

```json
[{ "check": "eval", "params": { "suite": "core-flows" }, "threshold": { "minScore": 0.8 } }]
```

A scored check with a bar. **Caveat:** no adapter shipped today produces a
score, so thresholds only work with runs recorded via `neon run record --score`.

Anti-patterns:

- **Changing the `done_when` to make it pass.** The bar belongs to the work
  order; changing it is a conversation with a person, never a fix.
- **Naming a check the repo hasn't declared.** It fails (D-007), on purpose. Run
  `neon checks sync` after editing `neon.checks.yaml`.
- **Checks that write into the repo** (snapshots, formatters). Run them before
  checking, not as the check.

---

## 3. Writing a good decision record

Copy this shape exactly; the `schema` check and `neon import` both read it.

```markdown
---
key: NEON-D-013
title: One sentence that states the decision itself
state: proposed
decided_at: 2026-10-08
author: caleb
components: [service, cli]
evidence_runs: []
---

## Rationale

Why this shape and not the obvious one. Two to five sentences.

## Rejected alternatives

### The obvious alternative

Why it was rejected, naming the constraint: a cost, a latency budget, team
size, what a model could do at the time, a deadline.

### Another alternative, if there was one

Why.

## What would change this

The evidence or change in circumstance that would reopen it.
```

What makes one good:

- **At least one rejected alternative, with the constraint that killed it.**
  "It was worse" is useless later. "Prisma's raw queries return untyped rows,
  which is where our interesting queries live" lets someone tell whether it
  still holds. No rejected alternative usually means nobody made a decision; the
  tools refuse such records.
- **A title that is the decision**, not the topic. "Drizzle, not Prisma", not
  "ORM choice".
- **Components that match declared component names** (`service`, `cli`,
  `plugin`, `packages/core` here), or the import can't link them and context
  packs won't surface the decision for that code.
- **An honest "What would change this".** If nothing could, it's a preference.
- **One decision per record**, `proposed` until a person accepts it.

Search the corpus before writing one (`neon_search`, or capture the idea and see
what comes back). The trigram matcher catches close wording better than
paraphrase: "Switch to Prisma" finds D-004, "Move the service from Drizzle to
Prisma" doesn't.

---

## 4. ChatGPT for thinking, Claude Code for building

Neon is the shared memory between the two. Everything stays local: no connector,
no public endpoint.

### ChatGPT → Neon

1. Think in ChatGPT as usual.
2. At the end, paste the prompt from `docs/chatgpt-export-prompt.md`. It makes
   ChatGPT produce ideas as `neon capture "..."` lines and decisions as
   `neon-decision` blocks in the record format above, including rejected
   alternatives and "What would change this".
3. **Edit the answer.** Delete anything you don't actually hold. ChatGPT will
   offer decisions that were really just opinions.
4. Save it, then from the repo it concerns:

   ```
   neon import ~/neon-inbox/2026-10-08-pricing.md --dry-run
   neon import ~/neon-inbox/2026-10-08-pricing.md
   ```

   Ideas are captured with source `chat`, and any prior rejection is shown on
   the spot. Decisions arrive as `proposed`.
5. If a decision should live in the repo's history, save its block as
   `knowledge/decisions/<KEY>-<slug>.md` and commit it.

### Neon → Claude Code

- Promote the ideas worth doing (`/neon:promote`), then `/neon:start`. The agent
  gets the decisions from your ChatGPT session in its context pack, with the
  reasons, so it won't re-propose what you already rejected.

### Neon → ChatGPT (manual, when you want to think again)

- `/neon:ideate` in Claude Code, or `curl http://127.0.0.1:4000/api/context/generative`,
  gives rejected alternatives whose constraint may have expired, contested
  decisions and recurring friction. Paste that into ChatGPT as the starting
  material for a new conversation.

---

## 5. Common mistakes

| Mistake | What happens | Do instead |
| --- | --- | --- |
| Checking out a branch name that differs from what `neon_start_work` returned | Neon can't find the claim (the branch *is* the link between git and Neon); `neon status` says nothing is claimed and the Stop hook stands aside | Use the returned branch exactly. If you got it wrong, `git branch -m <exact-name>` |
| Finishing before checking | `finish` refuses: "has never run on this change" | `neon check`, then `neon finish` |
| Checking with uncommitted changes and then committing different code | The runs are pinned to the old HEAD | Commit first, then check |
| Running `npm run seed` with `.env` pointing at your real database | Refused, if the database has any events | Seed the demo database explicitly: `DATABASE_URL=postgres://neon:neon@localhost:5433/neon npm run seed` |
| Editing `neon.checks.yaml` and forgetting to sync | Checks run the old commands, or a new check "is not registered" | `neon checks sync` |
| Expecting a change to become `merged` | It stays `open`; Neon can't see merges without the GitHub App | Mark the work order done by hand (section 1) |
| No components declared for a repo | Context packs come back nearly empty | Declare components (`POST /api/repos/<id>/components`) |
| Trying `neon finish --override` and being told no terminal is attached | Node didn't detect an interactive terminal. Some Git Bash (mintty) setups do this | Run it from PowerShell or Windows Terminal |
| Switching branches while `neon check` runs | `npm run dev` restarts the service on file changes, killing the check mid-run | Let checks finish before switching branches |
| Asking the agent to write `.neon/...` or edit `.claude/settings*.json` | Denied by the PreToolUse hook | Make that change yourself |
| Writing a long, paraphrased capture of an old idea | The prior rejection isn't found (trigram matching) | Keep capture titles short and use the key nouns |
