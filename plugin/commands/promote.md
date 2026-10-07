---
description: Turn an idea into a draft work order, with the structure it now has to earn
argument-hint: <idea-id>
allowed-tools: mcp__neon__neon_search, Bash, Read, Write
---

# Promote $ARGUMENTS

Read the idea: `neon inbox` lists them, and `neon_search` finds what it relates
to.

## Draft, do not decide

Write `.neon/promote-$ARGUMENTS.json` containing your draft:

```json
{
  "kind": "code",
  "title": "...",
  "intent": "why we are doing this — the problem, not the solution",
  "acceptanceCriteria": ["...", "..."],
  "declaredComponentIds": ["..."],
  "repoId": "...",
  "doneWhen": [{ "check": "tests.unit" }],
  "state": "draft"
}
```

- **Intent** is the problem in the team's own words. If you cannot state the
  problem without describing the solution, the idea is not ready to promote and
  saying so is more useful than promoting it anyway.
- **Acceptance criteria** are things a person could disagree with. "Works well"
  is not one.
- **`done_when`** for code work: draft it from the repo's registered checks
  (`neon checks sync` lists them; `GET /api/checks?repoId=` shows them). For
  inquiry work: a structural check that the record exists and names a rejected
  alternative, plus a review against stated criteria. Leave `done_when` empty
  and the work order stays a draft — which is the correct outcome if nobody can
  yet say what done means.
- **Kind** is `code` if it produces commits, `inquiry` if it produces records.
  Do not force a question into being a code task because code tasks feel more
  real.

## Then hand it over

Show the draft and ask the person to confirm or edit it. Only then run:

```
neon promote <idea-id> --file .neon/promote-<idea-id>.json
```

Never promote without that confirmation. Promotion is the point where a
half-formed thought becomes something the team has agreed is worth doing, and
that agreement is not yours to give.
