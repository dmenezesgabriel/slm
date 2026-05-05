# PRD: Stateful SLMS Coding Agent with Sessions, Memory, Retrieval, Compaction, and Events

Labels: needs-triage

## Problem Statement

SLMS is intended to be a hybrid small-language-model coding agent that runs on top of Transformers.js and can eventually support both Node.js and browser environments. Today, the core agent can call tools, stream tokens, and run a short agentic loop, but each user prompt starts with a fresh local message list. The terminal UI keeps display history, but that display history is not model memory. As a result, the agent does not reliably remember earlier messages in the same session, cannot resume work after restarting, cannot compact long conversations, and cannot retrieve relevant project context in a pi-like coding-agent workflow.

From the user's perspective, this makes the experience feel unlike pi or smolagents: the agent can answer a single task, but it does not feel like a persistent collaborator with working memory, session continuity, tool observations, retrievable context, or a structured event stream for the TUI.

The desired experience is a minimal but capable local-first coding agent using Transformers.js as the core inference dependency. It should preserve conversation memory, persist Node sessions, use explicit final-answer termination, support sequential tool execution, expose events for UI/SDK consumers, support model-specific tool-call parsing, and lay the foundation for retrieval and compaction without overbuilding browser-specific functionality in this phase.

## Solution

Build a stateful SLMS agent architecture around a session abstraction. The session owns persistent memory, converts that memory into model context, drives the existing agent loop, persists pi-like session entries to JSONL in Node, emits structured events to the TUI, and supports cancellation and message queueing.

The agent loop will use an explicit `final_answer` tool as the normal termination mechanism. Tool execution will remain sequential. Existing coding tools will remain minimal, with safer path handling for file operations and a confirmation hook for destructive bash commands. The TUI will move from display-only history to session-backed history and will gain session commands, queued messages, context usage display, collapsible tool results, and file references.

A separate retrieval package will provide hybrid lexical/vector retrieval over project/session context using a configurable embedding model. Compaction will be implemented after basic sessions and memory, using the same local model and a pi-style structured summary while preserving the full underlying session history.

The implementation should remain Transformers.js-first and local-first, but it should be modular enough to allow future provider/model adapters with minimal overhead. Browser-specific persistence and browser tools are out of scope for this PRD, but core interfaces should avoid unnecessary Node coupling where practical.

## User Stories

1. As an SLMS user, I want the agent to remember earlier messages in the current conversation, so that I can ask follow-up questions naturally.
2. As an SLMS user, I want the agent to remember files it has read during a session, so that I do not need to repeat context.
3. As an SLMS user, I want the agent to remember tool observations, so that it can build on previous command outputs.
4. As an SLMS user, I want the agent to persist sessions in Node, so that I can resume work after restarting the TUI.
5. As an SLMS user, I want a new session command, so that I can intentionally start fresh.
6. As an SLMS user, I want a resume command, so that I can continue previous work.
7. As an SLMS user, I want a session info command, so that I can understand which session I am currently using.
8. As an SLMS user, I want the agent to distinguish display history from model context, so that sensitive or noisy entries can be excluded from model input.
9. As an SLMS user, I want full session history to remain recoverable, so that compaction does not destroy information.
10. As an SLMS user, I want long tool outputs stored fully but sent to the model in truncated form, so that sessions remain useful without exhausting context.
11. As an SLMS user, I want the TUI to show tool calls and results, so that I can understand what the agent is doing.
12. As an SLMS user, I want tool results to be collapsible, so that long outputs do not dominate the terminal.
13. As an SLMS user, I want approximate context usage displayed, so that I can understand when the session is getting large.
14. As an SLMS user, I want the agent to compact old context when needed, so that long-running sessions continue to work.
15. As an SLMS user, I want compaction summaries to include goals, constraints, progress, decisions, next steps, and critical context, so that the agent can continue coherently.
16. As an SLMS user, I want compaction to track read and modified files, so that file context is not lost.
17. As an SLMS user, I want manual compaction, so that I can reduce context when I choose.
18. As an SLMS user, I want automatic compaction later, so that context exhaustion is handled gracefully.
19. As an SLMS user, I want the same local model to perform compaction, so that the system remains Transformers.js-first.
20. As an SLMS user, I want the agent to retrieve relevant project context, so that it can solve coding tasks without manually reading every file.
21. As an SLMS user, I want retrieval to combine lexical and vector search, so that exact matches and semantic matches both work.
22. As an SLMS user, I want the embedding model to be configurable, so that I can choose performance or quality.
23. As an SLMS user, I want a small default retrieval model, so that the system remains lightweight.
24. As an SLMS user, I want retrieval to be a separate package, so that it can evolve independently from the agent loop.
25. As an SLMS user, I want the agent to use project context similarly to pi, so that relevant files and instructions are surfaced when useful.
26. As an SLMS user, I want to reference files with an at-file style interaction, so that I can explicitly provide file context.
27. As an SLMS user, I want at-file references to inject useful file content into the prompt, so that the agent sees the referenced context.
28. As an SLMS user, I want path completion and file reference behavior to feel natural in the TUI, so that coding workflows are fast.
29. As an SLMS user, I want the agent to terminate with an explicit final answer, so that completion is unambiguous.
30. As an SLMS user, I want tool execution to remain sequential, so that behavior is predictable and simple.
31. As an SLMS user, I want the agent to support cancellation, so that I can stop a bad or slow generation.
32. As an SLMS user, I want to queue a steering message while the agent is working, so that I can correct course without waiting for the full task to finish.
33. As an SLMS user, I want to queue a follow-up message while the agent is working, so that I can add the next request without interrupting current work.
34. As an SLMS user, I want queued messages to be visible in the TUI, so that I know what will be delivered.
35. As an SLMS user, I want queued messages restored if I abort, so that my input is not lost.
36. As an SLMS user, I want the bash tool to remain powerful, so that the agent can perform real coding work.
37. As an SLMS user, I want destructive bash commands to require confirmation, so that accidental dangerous operations are less likely.
38. As an SLMS user, I want normal non-destructive bash commands to run without friction, so that the agent stays fast.
39. As an SLMS user, I want file tools blocked outside the working directory, so that the coding agent does not accidentally edit unrelated files.
40. As an SLMS user, I want read, write, and edit tools to return clear errors, so that the agent can recover from mistakes.
41. As an SLMS user, I want edit to support multiple exact replacements, so that the agent can make coordinated surgical edits.
42. As an SLMS user, I want edit to reject ambiguous replacements, so that accidental broad edits are avoided.
43. As an SLMS user, I want root-level duplicate demo code cleaned up after it is used for reference, so that the workspace package structure is the source of truth.
44. As an SLMS user, I want Qwen3 0.6B to remain the baseline supported model, so that there is a reliable default.
45. As an SLMS user, I want Qwen3.5 to work even if it uses a different tool-call format, so that I can try newer small models.
46. As an SLMS user, I want LFM2 to work with the best practical adapter/parser, so that LiquidAI small models are supported where feasible.
47. As an SLMS user, I want model-specific quirks hidden behind adapters, so that the agent loop stays stable.
48. As an SLMS user, I want thinking controls handled per model where supported, so that context budget is not wasted.
49. As an SLMS user, I want unsupported model behavior to fail clearly, so that I understand when a model is not tool-call compatible.
50. As an SLMS user, I want the core architecture to remain extendable, so that future non-Transformers.js providers can be added with minimal overhead.
51. As an SLMS developer, I want a session abstraction with a small stable API, so that UI, CLI, and future SDK consumers do not depend on agent internals.
52. As an SLMS developer, I want a session store abstraction, so that JSONL persistence can be tested independently.
53. As an SLMS developer, I want a context builder abstraction, so that model-visible memory can be tested independently from persistence.
54. As an SLMS developer, I want a model adapter registry, so that parser and template differences are isolated.
55. As an SLMS developer, I want a tool runtime abstraction, so that tool execution policy is separated from model generation.
56. As an SLMS developer, I want retrieval isolated in its own package, so that search quality can improve without destabilizing the agent loop.
57. As an SLMS developer, I want compaction isolated behind a small interface, so that summarization strategy can change later.
58. As an SLMS developer, I want structured events from sessions, so that the TUI can render model tokens, tool calls, tool results, errors, queued messages, and final answers.
59. As an SLMS developer, I want event contracts to be stable, so that future UIs and SDK integrations can reuse them.
60. As an SLMS developer, I want session entries to include timestamps and roles, so that session history can be replayed and debugged.
61. As an SLMS developer, I want session entries to separate assistant messages from tool results, so that context conversion remains accurate.
62. As an SLMS developer, I want entries to support an exclude-from-context flag, so that display-only information does not pollute model input.
63. As an SLMS developer, I want stored tool results to include error state, so that the agent can learn from failures.
64. As an SLMS developer, I want path guards implemented in tool execution rather than only in prompting, so that safety is enforced consistently.
65. As an SLMS developer, I want destructive bash detection to be conservative but simple, so that the first version is maintainable.
66. As an SLMS developer, I want tests to focus on external behavior, so that refactors do not break tests unnecessarily.
67. As an SLMS developer, I want to avoid a fake LLM test harness for now, so that the first implementation stays focused.
68. As an SLMS developer, I want offline behavior after model download, so that local-first usage is reliable.
69. As an SLMS developer, I want model loading to keep existing Transformers.js progress events, so that the TUI can show loading state.
70. As an SLMS developer, I want cancellation to use Transformers.js generation mechanisms where possible, so that aborts stop real work rather than only hiding output.
71. As an SLMS developer, I want the TUI to consume session events rather than agent callbacks directly, so that the UI remains decoupled from loop internals.
72. As an SLMS developer, I want slash commands to be implemented at the session/TUI boundary, so that core agent logic remains simple while user-facing commands remain cohesive.
73. As an SLMS developer, I want browser-specific storage and tools deferred, so that Node coding-agent reliability comes first.
74. As an SLMS developer, I want the future browser path kept in mind when designing interfaces, so that the architecture is not boxed into Node-only assumptions.
75. As an SLMS developer, I want compaction and retrieval to be introduced incrementally after memory works, so that each layer can be validated before the next is added.

## Implementation Decisions

1. The implementation will follow a hybrid pi/smolagents direction while remaining Transformers.js-first.
2. The initial supported runtime target for this PRD is Node.js with the terminal coding agent.
3. Browser-specific persistence, browser tools, and Web Worker integration are deferred.
4. The system will support both stateless agent runs and stateful session prompts.
5. Stateful interaction will be centered on an `AgentSession` deep module.
6. `AgentSession` will own lifecycle, message memory, event streaming, cancellation, and queued messages.
7. The existing lower-level agent loop will remain available for simple stateless usage.
8. Session memory will use pi-like persisted message entries rather than smolagents-style in-memory action steps.
9. Session persistence will use JSONL in Node.
10. Initial sessions will be linear; branching and session trees are deferred.
11. Full uncompacted history will remain in the session log.
12. A `SessionStore` deep module will handle append, load, resume, and session metadata behavior.
13. A `ContextBuilder` deep module will convert stored session entries into model-visible chat messages.
14. The context builder will decide what should and should not be read by the model.
15. Tool outputs will be stored fully when possible.
16. Tool outputs will be truncated or summarized when inserted into model context.
17. Context entries may be displayable but excluded from model context.
18. The agent loop will terminate through an explicit `final_answer` tool.
19. A text-only assistant response without `final_answer` may be treated as incomplete or recoverable depending on adapter behavior.
20. Tool execution will be sequential for this PRD.
21. A `ToolRuntime` deep module will normalize tool calls, validate input, run tools, collect observations, and emit tool events.
22. Existing coding tools remain minimal: read, write, edit, and bash.
23. No new public coding tools are added in this PRD except the internal final-answer tool.
24. The edit tool will support multiple exact replacements.
25. The edit tool will reject replacements that are missing or ambiguous.
26. File tools will be guarded to prevent operations outside the working directory.
27. Bash remains unrestricted by default for normal commands.
28. Destructive bash commands will require confirmation through a UI/session hook.
29. A destructive command detector will be conservative and simple in the first version.
30. Cancellation will be supported and should stop active generation where Transformers.js supports interruption.
31. Message queueing will support steering messages and follow-up messages.
32. Steering messages are delivered after the current assistant turn finishes its active tool call sequence.
33. Follow-up messages are delivered after the agent completes the current task.
34. The TUI will move from display-only history to session-backed history.
35. The TUI will render session events for tokens, assistant messages, tool calls, tool results, errors, cancellations, queued messages, and final answers.
36. The TUI will add session-oriented commands, including new, resume, session info, compaction, memory inspection, and model switching.
37. Slash commands will be handled at the TUI/session boundary rather than embedded in low-level model generation.
38. Tool results should be collapsible in the TUI.
39. The TUI should display approximate context usage.
40. File references will allow users to inject file context into prompts.
41. File references will be a TUI/session feature, not a model parser feature.
42. A `ModelAdapterRegistry` deep module will isolate model-specific behavior.
43. Qwen3 0.6B will be the default baseline model adapter.
44. Qwen3.5 will receive a custom parser for its XML-style function call format.
45. LFM2 will receive the best practical adapter for its template and tool-list behavior.
46. Model adapters may define tool-call parsers, final-answer formatting, thinking controls, and compatibility checks.
47. Unsupported or partially supported model behavior should fail clearly.
48. Retrieval will be implemented in a separate package.
49. Retrieval will use a hybrid lexical/vector approach.
50. Retrieval will use a configurable embedding model with a small default.
51. Retrieval will initially focus on project and session context useful for coding tasks.
52. Compaction will be implemented after stateful memory and persistence are working.
53. Compaction will use the same local model.
54. Compaction will use a structured summary format inspired by pi.
55. Compaction will preserve full underlying session history.
56. Root-level duplicate demo code will be used as reference, then removed or migrated so workspace packages are authoritative.
57. The architecture should remain compatible with future browser support where practical, but this PRD does not implement browser-specific behavior.
58. The architecture should remain extendable to future provider adapters, but this PRD keeps Transformers.js as the only inference implementation.
59. No ADRs were found in the repository, so no ADR constraints apply.
60. No separate glossary was found in the repository, so domain vocabulary is taken from the existing README and package names.

## Testing Decisions

1. Good tests should validate external behavior through stable module interfaces.
2. Tests should avoid asserting private implementation details.
3. Tests should avoid depending on downloaded LLM weights by default.
4. Tests should prefer deterministic inputs and outputs where possible.
5. Tests should cover deep modules rather than shallow rendering or wiring code where possible.
6. `SessionStore` should be tested for creating sessions, appending entries, loading sessions, preserving ordering, and preserving full history.
7. `ContextBuilder` should be tested for including prior conversation messages, excluding display-only entries, preserving useful tool observations, and truncating context-only tool results.
8. `ModelAdapterRegistry` should be tested with representative raw model outputs for Qwen3, Qwen3.5, and LFM2-compatible behavior.
9. `ToolRuntime` should be tested for sequential tool execution, final-answer termination, tool validation errors, tool execution errors, and event emission.
10. File operation tools should be tested for outside-working-directory blocking.
11. The edit tool should be tested for multiple exact replacements, missing old text, duplicate old text, and successful surgical edits.
12. Bash destructive-command confirmation should be tested at the policy boundary rather than by running destructive commands.
13. Retrieval should be tested for lexical search, vector search when an embedding backend is available, and hybrid ranking behavior.
14. TUI tests are lower priority because current infrastructure does not appear to include terminal UI testing prior art.
15. End-to-end model tests may be added as manual smoke tests rather than required automated tests.
16. Offline-after-download behavior should be validated as a smoke test once model cache behavior is wired into the session workflow.
17. The repository currently has no visible test infrastructure, so adding a minimal test runner and package scripts is part of the recommended implementation foundation.
18. A fake LLM harness is out of scope for the first version unless later needed to stabilize automated agent-loop tests.

## Out of Scope

1. Browser session persistence.
2. Browser-specific tools.
3. Web Worker model execution.
4. Session branching and tree navigation.
5. Multi-agent hierarchies.
6. Plan mode.
7. Automatic to-do management.
8. MCP integration.
9. Remote provider implementation.
10. Full extension system.
11. Sandboxed code-agent execution.
12. Parallel tool execution.
13. Adding public tools beyond the existing minimal coding tools and internal final answer.
14. Full pi feature parity.
15. Full smolagents feature parity.
16. Vision, audio, or multimodal agent behavior.
17. Browser IndexedDB/localStorage persistence.
18. Publishing packages or sharing sessions externally.
19. Git checkpointing.
20. Permission prompts for every tool call.
21. Fine-grained policy configuration beyond destructive bash confirmation and working-directory path guards.

## Further Notes

1. This PRD intentionally prioritizes memory and session correctness before retrieval and compaction.
2. The first practical milestone should make the TUI use a stateful session and demonstrate that the agent remembers previous user messages.
3. The second milestone should persist and resume Node sessions.
4. The third milestone should stabilize model adapters for Qwen3 0.6B, Qwen3.5, and LFM2.
5. The fourth milestone should add retrieval as a separate package.
6. The fifth milestone should add compaction using the same local model.
7. The default user experience should remain simple: start the coding agent, chat naturally, let it use read/write/edit/bash, and receive an explicit final answer.
8. The implementation should favor deep modules with small stable interfaces over many shallow helpers that leak internal details.
9. Because the GitHub issue CLI is unavailable in the current environment, this PRD is prepared as issue-ready content and labeled with `needs-triage` in the document metadata.
