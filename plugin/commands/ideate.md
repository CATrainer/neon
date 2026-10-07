---
description: A deliberate divergent session over the corpus — diverge first, filter second
argument-hint: [optional area to focus on]
allowed-tools: mcp__neon__neon_generative_context, mcp__neon__neon_search, mcp__neon__neon_propose
---

# Ideate $ARGUMENTS

Call `neon_generative_context` with the focus, if one was given.

## First, read the material out loud

Do not summarise it into a plan. Present it as the four kinds of provocation it
is, briefly:

- **Rejected alternatives** — what was tried in thought and discarded, with the
  constraint that blocked it and how long ago. Ask, for each, the only question
  that matters: *does that constraint still hold?* Corpus size, latency budgets,
  team size, what the model can do — these expire. Neon deliberately does not
  guess whether they have; that judgment is the person's.
- **Contested decisions** — both positions, and what would settle it. Unresolved
  tension is where ideas live.
- **Recurring friction** — a component in an unusual number of recent work
  orders, or a check that keeps failing. Neon can see these patterns; nobody
  else can. They are usually a design problem wearing a schedule's clothes.
- **Ageing ideas** — about to expire, unexamined.

## Then diverge

Generate **at least fifteen** distinct directions before evaluating any of them.
Deliberately include ones you expect to be wrong; the point of this phase is
coverage, not quality. Cheap and bad is fine here — it is a cheaper way to find
the edge of the space than thinking carefully about three safe options.

Do not converge early. If you find yourself writing "the most promising is…"
before fifteen, you have skipped the exercise.

Use `neon_search` when a direction reminds you of something — checking whether
it has already been reasoned about is the fastest way to make it better or kill
it.

## Then filter

Only now, and out loud:

- which are already rejected, and whether the reason still holds
- which are cheap to test and would settle something contested
- which are one work order and which are a programme
- which are interesting but not now, and should be captured rather than pursued

## Then offer to capture

Offer to file the survivors with `neon_propose(kind: "idea")` — as several
separate ideas, not one merged one. Ideas that survive on their own merits
should be able to die on their own merits too.
