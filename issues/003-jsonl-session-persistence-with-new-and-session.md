# JSONL session persistence with /new and /session

Labels: needs-triage

## What to build

Add Node JSONL session persistence for the stateful session. Persist session metadata and message entries during prompts, keep full uncompacted history recoverable, and expose TUI commands to start a new session and inspect the current session.

## Acceptance criteria

- A session is assigned a stable ID and metadata when created.
- User, assistant, tool call, and tool result session entries are appended to JSONL as the session runs.
- The session log preserves full stored content even when model-visible context is truncated.
- `/new` starts a fresh session and clears the active TUI conversation.
- `/session` displays the current session ID, storage location or persistence mode, message count, and basic context information.
- Session persistence can be disabled or bypassed for one-shot/stateless use.

## Blocked by

issues/001-stateful-prompt-path-remembers-previous-turns.md
