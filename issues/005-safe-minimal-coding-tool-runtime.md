# Safe minimal coding tool runtime

Labels: needs-triage

## What to build

Keep the Node coding-agent tool surface minimal while enforcing basic safety in the tool runtime. Read, write, and edit operations must stay inside the working directory. The edit tool should support multiple exact replacements. Bash should remain unrestricted for normal commands but require confirmation for destructive commands.

## Acceptance criteria

- Read, write, and edit reject paths outside the active working directory.
- Write creates parent directories only within the working directory.
- Edit supports multiple exact replacements in one tool call.
- Edit rejects missing or ambiguous old text and reports clear errors.
- Normal bash commands run without confirmation.
- Destructive bash commands trigger a confirmation request before execution.
- Rejected or failed tool calls produce observations the agent can use to recover.

## Blocked by

issues/002-explicit-final-answer-tool-and-sequential-tool-events.md
