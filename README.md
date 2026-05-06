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
│   ├── tool-routing/         high-confidence fallback routing for tiny models
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
4. If a very small model ignores an obvious tool request, `HeuristicToolRouter`
   performs one high-confidence fallback call for arithmetic, date/time,
   weather, and Wikipedia intents.
5. `Tool.run()` validates arguments with Zod, executes the tool, and appends the
   observation to history. The loop repeats until a final answer or `maxSteps`.

---

## Setup

```bash
pnpm install   # or npm install
```

---

## Usage

```bash
# Run all demo queries (downloads ~350 MB on first run)
pnpm start

# Single question
node src/index.js "What is the weather in Tokyo right now?"
# or
pnpm start -- "What is the weather in Tokyo right now?"

# Streaming tokens to stdout
STREAM=true node src/index.js "What is 144 squared?"
```

### Environment variables

| Variable          | Default                          | Description                     |
|-------------------|----------------------------------|---------------------------------|
| `MODEL`           | `onnx-community/functiongemma-270m-it-ONNX` | HF model id                     |
| `DTYPE`           | `q4`                             | `q4` / `q4f16` / `fp32`        |
| `DEVICE`          | `cpu`                            | `cpu` (ONNX/wasm) or `webgpu`  |
| `CACHE_DIR`       | `./.cache`                       | Local model cache directory     |
| `MAX_STEPS`       | `8`                              | Max agent iterations            |
| `MAX_NEW_TOKENS`  | `512`                            | Answer-phase token budget       |
| `VERBOSE`         | `true`                           | Show step-by-step logs          |
| `STREAM`          | `true`                           | Stream tokens to stdout         |
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
  model:  "onnx-community/functiongemma-270m-it-ONNX",
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

The default is `onnx-community/functiongemma-270m-it-ONNX` because it is light.
Its function-call markers are special tokens, so decoded outputs may look like
`call:calculator{expression:...}` without wrapper tokens; this is handled by
`FunctionGemmaStrategy`.

Qwen models are handled by `QwenStrategy`. Switch with, for example:

```bash
MODEL=onnx-community/Qwen3-0.6B-ONNX node src/index.js "What is 2+2?"
```

The loader is keyed by model/dtype/device/cache settings, so changing `MODEL`
inside the same process no longer reuses the wrong pipeline.

To add another model family, implement a strategy and register it with
`registerModelStrategy()` from `src/core/model-strategies/factory.js`.

## Interesting

- https://github.com/ngxson/wllama