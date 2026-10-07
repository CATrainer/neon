---
key: NEON-D-005
title: Generated rules are managed blocks in a CLAUDE.md beside the code they govern
state: accepted
decided_at: 2026-08-08
author: caleb
components: [service, cli]
evidence_runs: []
---

## Rationale

The point of a path-scoped rule is that it loads when an agent touches the files
it governs and stays out of context entirely otherwise. That property is what
makes it cheaper and more reliable than the context pack — no MCP call, no token
budget, no retrieval failure mode — and it only holds if the file lives in the
directory the constraint applies to.

So a rule generated from a decision constraining a component goes into
`<component-directory>/CLAUDE.md`, inside markers Neon owns:

```
<!-- neon:D-12 --> … <!-- /neon:D-12 -->
```

Markers rather than whole files because a directory may hold constraints from
several decisions plus whatever a human wrote there, and Neon must be able to
update its own block without touching the rest. A component spanning two
unrelated roots gets a rule in each, rather than one hoisted to their common
ancestor — hoisting would put the constraint in front of everyone working
anywhere below it, which is the failure it exists to avoid.

Context assembly excludes any decision already carried by a rule, and says so in
the pack's notes. Duplicating it would spend budget to dilute what is left.

## Rejected alternatives

### One file per decision under `.claude/rules/`, imported from the root

Rejected because an import from the root `CLAUDE.md` loads for every session in
the repo, which is exactly the always-on behaviour path-scoping is meant to
replace. It would have been tidier to generate and worse at the only job it has.

### Neon stores the rule text and serves it on request

Rejected on principle: Neon would then hold the only copy of something, and the
rule would stop being visible in the diff where a human confirms it. Neon holds
the path and a content hash, for drift detection.

### Auto-commit the generated rules

Rejected. Everything Neon generates is a proposal for human confirmation, and a
system that writes to your repo unprompted is one people stop trusting long
before they stop using it. `neon rules --write` writes to the working tree and
prints `git diff`; committing is someone's decision.

## What would change this

A tool-neutral path-scoped rule format that more than one coding agent reads.
Today `CLAUDE.md` is what this plugin's users have; the generator's target path
is the seam to change if that stops being true.
