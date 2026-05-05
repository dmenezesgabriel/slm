# At-file prompt context references

Labels: needs-triage

## What to build

Add at-file prompt references to the TUI/session path. A user should be able to reference project files naturally, have useful file content injected into the prompt context, and keep injected context represented in session memory without confusing display-only history with model-visible context.

## Acceptance criteria

- The TUI can detect and complete file references in user input.
- Submitted prompts with file references inject bounded file content into model-visible context.
- Injected file context is represented in session memory with clear metadata.
- Referenced files outside the working directory are rejected.
- File reference behavior does not require the model to parse file-reference syntax.
- The visible conversation makes it clear that file context was attached or injected.

## Blocked by

issues/001-stateful-prompt-path-remembers-previous-turns.md
issues/003-jsonl-session-persistence-with-new-and-session.md
