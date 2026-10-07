---
description: Draft the work order and records that should have existed for work done outside Neon
argument-hint: [--since <ref>]
allowed-tools: mcp__neon__neon_propose, mcp__neon__neon_search, Bash, Read, Write
---

# Reconcile $ARGUMENTS

Bypass is allowed. There will be 2am hotfixes and offline days, and work done
outside Neon is fine — what is not fine is a corpus that quietly becomes
fiction. This is the designed escape hatch, so make it pleasant to use.

## 1. Find what is unrecorded

Run `neon reconcile $ARGUMENTS`. It lists the commits with no work order trailer
and the files they touched.

## 2. Read the diff, not the commit messages

`git diff <since>...HEAD`. Commit messages say what someone meant to do; the
diff says what happened. Work out:

- what problem this change was solving, from the change itself
- which components it actually touched — derived from the paths, never from
  anyone's declaration
- what someone would need to know to safely change this code next month

## 3. Draft, then confirm

Present, for the person to edit:

- a work order: intent, acceptance criteria implied by the change, kind
- any decision the change embodies — a shape chosen over an obvious
  alternative, an invariant that now has to hold — with the rejected
  alternative and the reason
- for code repos, the spec delta the change should have carried

Ask before filing anything. Then file with `neon_propose` and, if the person
wants the commits attached, record the work order key in a follow-up commit
trailer or in the PR that lands next.

## Tone

Do not lecture anyone about having bypassed the system. The escape hatch was
designed rather than discovered precisely so that using it is normal;
undesigned escape hatches get used silently, which is the failure mode that
matters.
