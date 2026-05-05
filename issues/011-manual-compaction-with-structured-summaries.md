# Manual compaction with structured summaries

Labels: needs-triage

## What to build

Add manual session compaction using the same local model. The compactor should generate a pi-style structured summary, append a compaction entry, and make future model context use the summary plus recent messages while preserving full JSONL history.

## Acceptance criteria

- `/compact` triggers manual compaction for the active session.
- Compaction uses the configured local model rather than a remote provider.
- The summary includes goal, constraints, progress, key decisions, next steps, critical context, read files, and modified files.
- A compaction entry is appended without deleting earlier session entries.
- Future model context includes the compaction summary plus recent messages.
- The session can still expose or recover full uncompacted history from JSONL.
- Compaction errors are reported clearly and do not corrupt the session.

## Blocked by

issues/003-jsonl-session-persistence-with-new-and-session.md
issues/008-context-usage-display-and-collapsible-tool-output.md
