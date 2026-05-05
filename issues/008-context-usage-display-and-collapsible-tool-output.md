# Context usage display and collapsible tool output

Labels: needs-triage

## What to build

Add model-visible context usage estimation and collapsible tool result rendering to the TUI. Full tool results should remain stored in the session log while the display and model context can use shorter views.

## Acceptance criteria

- The session can estimate model-visible context size for the active prompt.
- The TUI status area displays approximate context usage.
- Tool results render in a collapsed or summarized state when long.
- The user can expand or collapse tool result display.
- Collapsing a tool result does not remove full stored session data.
- Model-visible truncation remains distinct from TUI display collapse.

## Blocked by

issues/002-explicit-final-answer-tool-and-sequential-tool-events.md
issues/003-jsonl-session-persistence-with-new-and-session.md
