# Model adapter registry for Qwen3, Qwen3.5, and LFM2

Labels: needs-triage

## What to build

Introduce a model adapter registry that hides model-specific tool-call, thinking, and prompt-template quirks behind one normalized assistant response shape. Keep Qwen3 0.6B as the default baseline and add practical support for Qwen3.5 and LFM2 formats.

## Acceptance criteria

- The agent loop consumes one normalized assistant response shape regardless of adapter.
- Qwen3 0.6B tool calls continue to parse correctly.
- Qwen3.5 XML-style function calls parse into normalized tool calls.
- LFM2-compatible behavior is handled through a practical adapter or clear unsupported-mode error.
- Thinking controls are applied only where the selected adapter supports them.
- Unsupported or partially supported model behavior fails with a clear message.
- Existing model loading progress behavior remains intact.

## Blocked by

issues/002-explicit-final-answer-tool-and-sequential-tool-events.md
