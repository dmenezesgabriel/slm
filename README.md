# tjs-agent

A minimal agentic loop built **purely on transformers.js v4** — no LangChain,
no AI SDK, no wrappers.

```
@huggingface/transformers v4   ← inference + native tool-calling
zod                            ← tool input validation
zod-to-json-schema             ← Zod → OpenAI-compatible JSON Schema
```

---

## Architecture

```
src/
├── core/
│   ├── model.js              keyed pipeline loader, progress reporter
│   ├── tool.js               Tool base class (Zod schema → JSON Schema)
│   ├── tool-call.js          OpenAI-style tool-call helper
│   ├── model-strategies/     model-specific prompt kwargs + reply parsing
│   └── agent.js              model-agnostic agentic loop
├── tools/
│   ├── calculator.js
│   ├── datetime.js
│   ├── wikipedia.js
│   └── weather.js
└── index.js        demo entry point
```

### How tool-calling works

1. `Agent.run(query)` builds `messages` and `toolSchemas` from each registered
   `tool.toOpenAISchema()`.
2. A model strategy selected by `createModelStrategy(MODEL)` decides how tools
   and model-specific flags are forwarded to `apply_chat_template()`.
3. The same strategy parses model-specific tool-call text back into normalized
   OpenAI-style `{ function: { name, arguments } }` calls.
   - FunctionGemma uses compact `call:name{...}` syntax and needs tolerant
     parsing because transformers.js strips its function-call special tokens.
   - Qwen uses `<tool_call>{...}</tool_call>` and optional thinking kwargs.
4. `Tool.run()` validates arguments with Zod, executes the tool, and appends the
   observation to history. The loop repeats until a final answer or `maxSteps`.

Tool selection is model-driven through the chat template and registered tool
schemas; there is no keyword/regex fallback router. Tool schemas are strict and
tool inputs are validated before execution.

### Agent harness / node mapping

The current loop stays intentionally small while keeping clear graph-style
breakpoints:

- **LLM node**: `_generate()` calls the model with the chat template and tools.
- **Tool node**: `_executeToolCalls()` executes registered tools only.
- **Guardrail node**: `Tool.run()` validates model arguments with strict Zod
  schemas before execution.
- **Control node**: the bounded `maxSteps` loop decides whether to continue with
  tool observations or return the final answer.
- **Trace hooks**: `runWithTrace()`, `lastTrace`, `onStep`, `onToolCall`,
  `onToolResult`, `onToken`, and `onProgress` expose the flow for tests and UIs
  without coupling the agent to a test framework. `trace.toolCalled`,
  `trace.toolCalls`, and `trace.toolResults` make tool use directly observable.

Memory, fallback, and human-input nodes should be added as separate components
only when a product requirement needs them.

The smoke suite uses `runWithTrace()` to assert that the model selected a tool,
then checks calculator observations against an independent Python oracle.

---

## Setup

```bash
pnpm install   # or npm install
```

---

## Usage

```bash
# Run all demo queries (downloads the default model on first run)
pnpm start

# Single question
node src/index.js "What is the weather in Tokyo right now?"
# or
pnpm start -- "What is the weather in Tokyo right now?"

# Streaming tokens to stdout
STREAM=true node src/index.js "What is 144 squared?"

# Smoke-test native model tool selection with harder prompts
# (cases do not say "use/call the tool")
pnpm test:tool-call

# Print a concise trace summary from the CLI
TRACE=true STREAM=false pnpm start -- "Evaluate sqrt(9801) + 7 ** 3."
```

### Environment variables

| Variable          | Default                          | Description                     |
|-------------------|----------------------------------|---------------------------------|
| `MODEL`           | `onnx-community/Qwen3-0.6B-ONNX` | HF model id                     |
| `DTYPE`           | `q4`                             | `q4` / `q4f16` / `fp32`        |
| `DEVICE`          | `cpu`                            | `cpu` (ONNX/wasm) or `webgpu`  |
| `CACHE_DIR`       | `./.cache`                       | Local model cache directory     |
| `MAX_STEPS`       | `8`                              | Max agent iterations            |
| `MAX_NEW_TOKENS`  | `512`                            | Answer-phase token budget       |
| `VERBOSE`         | `true`                           | Show step-by-step logs          |
| `STREAM`          | `true`                           | Stream tokens to stdout         |
| `TRACE`           | `false`                          | Print a concise tool-call trace summary |
| `THREADS`         | `2`                              | ONNX CPU thread count. Keep low on RAM-constrained machines. |
| `ENABLE_THINKING` | `false`                          | Qwen3 chain-of-thought. When `false` (default) the template pre-fills an empty `<think></think>` block so the model skips reasoning and dedicates all tokens to the answer. Set `true` to keep full reasoning — `THINKING_BUDGET` tokens are added automatically so the answer is never truncated by the thinking phase. |
| `THINKING_BUDGET` | `512`                            | Extra tokens reserved for `<think>…</think>` when `ENABLE_THINKING=true`. Raise to `1024`+ for hard multi-step problems. |

---

## Adding a tool

```js
// src/tools/my_tool.js
import { z }    from "zod";
import { Tool } from "../core/tool.js";

export class MyTool extends Tool {
  name        = "my_tool";
  description = "Does X given a Y string.";
  schema      = z.object({
    y: z.string().describe("The Y value"),
  });

  async execute({ y }) {
    return `result: ${y}`;
  }
}
```

Register it in `src/index.js`:

```js
import { MyTool } from "./tools/my_tool.js";

const agent = new Agent({
  tools: [...existingTools, new MyTool()],
});
```

---

## Browser / Web Worker porting

`src/core/model.js` and `src/core/agent.js` contain no Node-only APIs except
optional `process.stderr` writes (guarded by `typeof process !== "undefined"`).

To port to a browser Web Worker:

```js
// worker.js
import { Agent } from "./core/agent.js";
import { CalculatorTool } from "./tools/calculator.js";

const agent = new Agent({
  model:  "onnx-community/Qwen3-0.6B-ONNX",
  device: "webgpu",   // GPU in browser
  dtype:  "q4f16",    // GPU-friendly quantisation
  tools:  [new CalculatorTool()],
  onProgress: (ev) => self.postMessage({ type: "progress", ev }),
  onToken:    (t)  => self.postMessage({ type: "token", t }),
});

self.onmessage = async ({ data }) => {
  const answer = await agent.run(data.query);
  self.postMessage({ type: "answer", answer });
};
```

---

## Model notes

The default is `onnx-community/Qwen3-0.6B-ONNX`, handled by `QwenStrategy`.
Qwen emits tool calls as `<tool_call>{...}</tool_call>` blocks, which are parsed
into normalized OpenAI-style tool calls before execution.

FunctionGemma models are also supported. Their function-call markers are special
tokens, so decoded outputs may look like `call:calculator{expression:...}`
without wrapper tokens; this is handled by `FunctionGemmaStrategy`. Switch with,
for example:

```bash
MODEL=onnx-community/functiongemma-270m-it-ONNX node src/index.js "What is 2+2?"
```

The loader is keyed by model/dtype/device/cache settings, so changing `MODEL`
inside the same process no longer reuses the wrong pipeline.

To add another model family, implement a strategy and register it with
`registerModelStrategy()` from `src/core/model-strategies/factory.js`.

## Interesting

- https://github.com/ngxson/wllama