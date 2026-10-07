# ChatGPT → Neon: the export prompt

Thinking happens in a ChatGPT conversation; building happens in Claude Code.
This prompt turns the end of a conversation into something Neon can hold, so
the ideas and decisions do not die in the chat window.

Nothing here needs a connector or a public endpoint. You copy ChatGPT's answer
into a file and run `neon import` on your own machine, against your local Neon.

## How to use it

1. At the end of a ChatGPT conversation worth keeping, paste the prompt below.
2. Read what it produces. Delete anything that is not actually an idea or a
   decision you hold. It is a draft; you are the filter.
3. Save the answer as a `.md` file, for example `~/neon-inbox/2026-10-07-pricing.md`.
4. From inside the repo it concerns (so ideas attach to that repo):

   ```
   neon import ~/neon-inbox/2026-10-07-pricing.md --dry-run
   neon import ~/neon-inbox/2026-10-07-pricing.md
   ```

   Ideas are captured with source `chat`, and Neon tells you on the spot if
   something like one was already rejected. Decisions arrive as `proposed`:
   accepting one is a separate, deliberate act.

5. If a decision is one you want in the repo's history, also save its block as
   `knowledge/decisions/<KEY>-<slug>.md` and commit it. Neon holds the summary
   and a hash; git holds the record.

The `neon capture` lines are real commands, so you can paste them straight into
a terminal instead of importing the file.

## The prompt

Copy everything between the lines.

---

Turn this conversation into material for Neon, my engineering knowledge system.
Output only the two sections below, in this exact format, with nothing before or
after them. Do not invent anything we did not actually discuss. If a section
would be empty, write the heading and "None." under it.

## Ideas

One line per idea worth keeping that we did NOT settle. Each is a shell command:

neon capture "Short title, at most a dozen words
Two or three sentences in my own framing: what the idea is and why it came up."

Rules: the title is the first line inside the quotes and the body follows on the
next line(s). Never use a double quote inside the text; use single quotes. One
`neon capture` per idea; do not merge ideas, so each can survive or die on its
own merits.

## Decisions

One block per decision we actually made, where at least one alternative was
considered and rejected. If nothing was rejected, it was not a decision: leave it
out. Each block is fenced exactly like this (the fence language must be
`neon-decision`, and do not put other code fences inside it):

```neon-decision
---
title: One sentence stating the decision itself
state: proposed
decided_at: YYYY-MM-DD
author: caleb
components: [names of the parts of the system it constrains]
evidence_runs: []
---

## Rationale

Why this shape and not the obvious one, in two to five sentences.

## Rejected alternatives

### Name of the first alternative

Why it was rejected. Name the specific constraint (cost, latency, team size,
what a model could do at the time, a deadline) so that someone later can tell
whether it still holds.

### Name of the second alternative, if there was one

Why it was rejected.

## What would change this

The evidence or change in circumstance that would reopen this decision.
```

---

## The format, for reference

`neon import` reads:

- every `neon capture "..."` command, which may span lines. The first line is
  the title and the rest is the body, exactly as `neon capture` itself reads it;
- every fenced block whose language is `neon-decision`, in the same record
  format as `knowledge/decisions/` (frontmatter, `## Rationale`,
  `## Rejected alternatives` with one `###` per alternative,
  `## What would change this`);
- or, if the whole file starts with `---` frontmatter, the file as one record.

It refuses a decision with no rejected alternative or no rationale, and says so.
"What would change this" has no column of its own, so it is kept at the end of
the rationale where search and context packs can see it. Re-importing a file
skips ideas whose title already exists and decisions whose key already exists.
