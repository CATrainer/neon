# NEON-7: Stop PostToolUse pasting the edited path into a shell command

## Why

`post-tool-use.mjs` runs the formatter as `<command> "<path>"` through a shell.
Agents choose file names, so a name containing a quote and a command separator
runs whatever follows it, on every edit, with the developer's permissions.
Found while writing the NEON-4 hook tests; listed as item 19 in the earlier
review.

## Acceptance criteria

- A path is only ever passed to the formatter if every character in it is safe
  inside double quotes in both sh and cmd.exe.
- Any other path is not formatted, the hook says so, and it still never blocks.
- A test shows a crafted path no longer runs a second command.
