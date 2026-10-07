# NEON-12: Make the plugin installable

## Why

`claude plugin validate ./plugin` failed with `agents: Invalid input`:
`plugin.json` gave `agents` as a directory, and Claude Code's manifest schema
accepts only `.md` file paths there. The repo also had no
`.claude-plugin/marketplace.json`, so the README's `/plugin marketplace add`
instructions could not work. Found on 2026-10-07 while checking the runbook's
install steps against Claude Code's documentation.

## Acceptance criteria

- `claude plugin validate` passes for `./plugin` and for the repo-root
  marketplace.
- `plugin.json` relies on the standard layout instead of naming default
  directories.
- A marketplace manifest at `.claude-plugin/marketplace.json` lists the plugin.
- The README gives install steps that match Claude Code's documented commands,
  including `--plugin-dir` for development.
- A test fails if the manifests drift from the layout.
