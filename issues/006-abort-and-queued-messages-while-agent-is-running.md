# Abort and queued messages while the agent is running

Labels: needs-triage

## What to build

Add cancellation and message queueing to the stateful session and TUI. Users should be able to abort active work, queue steering messages for delivery after the current tool sequence, and queue follow-up messages for delivery after the current task completes.

## Acceptance criteria

- The user can request abort while generation or tool execution is active.
- Active generation is interrupted when supported by Transformers.js.
- The TUI exposes a way to queue a steering message while the agent is running.
- The TUI exposes a way to queue a follow-up message while the agent is running.
- Queued messages are visible in the TUI.
- Steering messages are delivered after the current assistant turn finishes its active tool call sequence.
- Follow-up messages are delivered after the agent completes the current task.
- Queued input is restored or preserved when the user aborts.

## Blocked by

issues/001-stateful-prompt-path-remembers-previous-turns.md
issues/002-explicit-final-answer-tool-and-sequential-tool-events.md
