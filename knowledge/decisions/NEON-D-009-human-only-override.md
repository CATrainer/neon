---
key: NEON-D-009
title: The only Stop-hook override is NEON_SKIP_CHECKS in the session's launch environment
state: proposed
decided_at: 2026-10-07
author: Claude Code, working from Caleb's brief; awaiting Caleb's confirmation
components: [plugin]
evidence_runs: []
---

## Rationale

The Stop hook's promise is that a person can override it and the agent cannot.
That was false: the agent could create `.neon/skip-checks` with a single Write
or shell command, and the hook stood aside. A gate the gated party can open is
a suggestion.

The environment Claude Code is launched with is set by the person before the
session exists. Hook processes inherit it. The agent's shell commands run in
child processes, and nothing a child process does to its own environment
propagates back to the parent, so `export NEON_SKIP_CHECKS=1` in a Bash tool
call changes nothing the hook can see. That makes `NEON_SKIP_CHECKS=1 claude`
the one override that sits on the person's side of the line by construction
rather than by policing.

The remaining ways an agent could reach that environment are Claude Code's own
settings files, whose `env` block sets variables for sessions and whose
`disableAllHooks` turns hooks off entirely. So the PreToolUse hook now protects
`.claude/settings.json`, `.claude/settings.local.json` and the user-level
settings files in every repo, alongside `.neon/**`, and a Bash branch denies
shell commands that name any of them.

`/neon:promote` used to write its draft into `.neon/`; it now passes the
confirmed draft to `neon promote` on stdin, which the CLI already supported.

Evidence that the change is real rather than cosmetic: of the 20 hook tests
added with it, the 10 that describe the weakness fail against the previous
hooks and pass now.

## Rejected alternatives

### Keep the skip file and protect it with the PreToolUse hook

Rejected because the protection inspects tool calls, and a file can be created
by paths the hook never sees: a script the agent writes under an innocent name
and then runs, or a command built to dodge a pattern. If the file still
switched the gate off, every such gap would fail open. With the file ignored, a
gap in the tripwire costs nothing.

### Parse shell commands and deny only writes to `.neon/`

Rejected because a shell has too many ways to write a file — redirects, `tee`,
`cp`, `mv`, `node -e`, `python -c`, PowerShell cmdlets — and a parser good
enough to trust is a project of its own. The hook denies any mention of the
directory instead; an agent has no reason to read it either.

### A one-time override token issued by the service

Rejected for now because the service has no authentication. Anything a person
can ask the REST API for, the agent can ask for over the same unauthenticated
API, so a token would look stronger than the environment variable while being
weaker.

### Ask for confirmation inside the Stop hook

Rejected because hooks run non-interactively: there is no terminal to ask in,
and a prompt the agent can answer is not a confirmation.

## What would change this

Authentication in the service. Once a request can be attributed to a person
rather than to whoever is on localhost, an override can be a recorded event
with a human actor and a reason, which is auditable in a way an environment
variable is not. Also: Claude Code offering hooks a signal of human approval
that the agent cannot forge.

This is a guardrail against an agent talking itself past the gate, not a
sandbox against an agent working to escape. An agent with unrestricted shell
access can still write and run a script that edits files the hook does not
inspect; Claude Code's permission system is the layer for that.
