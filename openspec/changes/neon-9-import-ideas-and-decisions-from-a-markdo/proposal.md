# NEON-9: Import ideas and decisions from a markdown file

## Why

Thinking happens in ChatGPT and building happens in Claude Code, and nothing
carries the ideas and decisions from one to the other. The decision records in
`knowledge/decisions` have also never been loaded into the service, so context
packs and prior-rejection checks on real work come back empty (observed on
NEON-1: an empty pack).

## Acceptance criteria

- `neon import <file.md>` creates ideas from `neon capture "..."` lines (source
  `chat`) and decisions from records in this repo's format, through the
  existing domain functions.
- Imported decisions are `proposed` unless `--as-recorded` is given, which keeps
  the record's own state and date.
- A decision with no rejected alternative is refused, and re-importing skips
  what already exists.
- `--dry-run` reports what would be created without creating anything.
- A prompt template tells ChatGPT to produce exactly this format, including
  "What would change this".
- Unit tests for the parser and integration tests for the import.

## What changes

- `service/src/import/parse.ts`: the format, parsed with the same record parser
  the `schema` check uses.
- `POST /api/import`, calling `captureIdea` and `createDecision`.
- `createDecision` accepts the date a decision was made.
- `neon import` in the CLI.
- `docs/chatgpt-export-prompt.md`.

## Found on the way

Prior-rejection matching is trigram similarity with a 0.3 threshold. "Switch to
Prisma" scores 0.41 against NEON-D-004's rejected alternative and is caught;
"Move the service from Drizzle to Prisma" scores 0.18 and is not. A test records
both.
