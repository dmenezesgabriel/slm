# @slms/retrieval project-context tracer

Labels: needs-triage

## What to build

Add a separate retrieval package that provides a narrow hybrid lexical/vector search interface. Use it to index useful project and session text and inject retrieved project context into the stateful session prompt path.

## Acceptance criteria

- A separate retrieval package is available in the workspace.
- The retrieval package exposes a small interface for indexing, removing, clearing, and searching documents.
- Lexical search works without requiring an embedding model.
- Vector search can use a configurable Transformers.js embedding model.
- Hybrid ranking combines lexical and vector signals when embeddings are available.
- The coding-agent can inject retrieved project context into a prompt through the session path.
- Retrieval failures degrade gracefully without breaking normal prompts.

## Blocked by

issues/001-stateful-prompt-path-remembers-previous-turns.md
issues/003-jsonl-session-persistence-with-new-and-session.md
issues/009-at-file-prompt-context-references.md
