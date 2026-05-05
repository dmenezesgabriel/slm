# Explicit final_answer tool and sequential tool events

Labels: needs-triage

## What to build

Add an internal `final_answer` tool as the normal agent termination path. Route tool calls through a sequential tool runtime that normalizes tool calls and tool results, records observations in session memory, emits structured events, and shows tool activity in the TUI.

## Acceptance criteria

- The model receives a `final_answer` tool schema alongside registered tools.
- The agent loop stops successfully when `final_answer` is called.
- Tool calls execute sequentially in model-provided order.
- Tool call and tool result events are emitted with enough data for the TUI to render them.
- Tool observations are added to model-visible context for the next step.
- A prompt that requires a tool can complete through the final-answer path.

## Blocked by

issues/001-stateful-prompt-path-remembers-previous-turns.md
