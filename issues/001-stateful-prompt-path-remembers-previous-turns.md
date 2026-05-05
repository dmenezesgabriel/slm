# Stateful prompt path remembers previous turns

Labels: needs-triage

## What to build

Add a minimal stateful `AgentSession` path that stores user and assistant messages in memory, builds model context from previous turns, exposes a stable prompt API, emits basic session events, and wires the TUI to use session-backed history instead of display-only history. A completed slice should let a user ask a follow-up question and have the agent receive prior session messages as context.

## Acceptance criteria

- The coding-agent TUI uses the stateful session prompt path for normal chat input.
- A second prompt in the same running session includes previous user and assistant messages in model-visible context.
- Session events are emitted for prompt start, token output, assistant response, errors, and completion.
- Display history is derived from session state rather than a separate display-only memory path.
- Stateless agent usage remains available for simple one-shot calls.

## Blocked by

None - can start immediately
