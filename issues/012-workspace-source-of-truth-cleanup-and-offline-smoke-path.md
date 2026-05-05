# Workspace source-of-truth cleanup and offline smoke path

Labels: needs-triage

## What to build

Clean up the workspace so package entrypoints are the source of truth, and document or script a smoke path for offline-after-download usage. Duplicate root demo code should be removed or migrated after it has been used as reference.

## Acceptance criteria

- Duplicate root-level demo/source code is removed or migrated out of the authoritative implementation path.
- Workspace packages are the documented entrypoints for core, TUI, and coding-agent usage.
- Package scripts reflect the supported development and smoke-test workflows.
- A smoke path verifies that a previously downloaded model can be used offline.
- Model loading progress remains visible during first download.
- Cleanup does not remove useful examples without replacing or documenting them.

## Blocked by

issues/003-jsonl-session-persistence-with-new-and-session.md
issues/007-model-adapter-registry-for-qwen3-qwen35-and-lfm2.md
