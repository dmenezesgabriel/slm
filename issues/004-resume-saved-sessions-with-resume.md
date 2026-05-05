# Resume saved sessions with /resume

Labels: needs-triage

## What to build

Add saved-session discovery and loading so a user can resume prior JSONL sessions from the TUI. Resumed sessions should restore visible history and send previous relevant messages back into model-visible context.

## Acceptance criteria

- Existing saved sessions for the current project can be discovered.
- `/resume` lets the user choose a saved session from the TUI.
- Resuming a session restores visible conversation history.
- Follow-up prompts after resume include prior model-visible session messages.
- Resumed sessions continue appending to the selected session log.
- The current session information reflects the resumed session.

## Blocked by

issues/003-jsonl-session-persistence-with-new-and-session.md
