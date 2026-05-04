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
│   ├── model.js    singleton pipeline loader, progress reporter, TextStreamer
│   ├── tool.js     Tool base class (Zod schema → JSON Schema, validated run())
│   └── agent.js    Agent class + agentic loop
├── tools/
│   ├── calculator.js
│   ├── datetime.js
│   ├── wikipedia.js
│   └── weather.js
└── index.js        demo entry point
```

### How tool-calling works (no ReAct, no regex parsing)

1. `Agent.run(query)` builds a `messages` array and a `toolSchemas` array from
   `tool.toOpenAISchema()` for each registered tool.
2. The pipeline call receives `{ tools: toolSchemas }`. The model's chat
   template (Qwen3's `tool_use` variant) renders the tool definitions into the
   prompt automatically.
3. The pipeline returns `reply.tool_calls` — a structured array, no parsing
   needed. Each entry has `{ function: { name, arguments } }`.
4. `Agent._generate()` validates args through `Tool.run()` (Zod), executes, and
   appends `{ role: "tool", content: result }` to `messages`.
5. Loop repeats until `reply.tool_calls` is empty (text answer) or `maxSteps`.

Everything is native to transformers.js v4. The only user-space code is the
`for` loop in `agent.js` and the Zod validation in `tool.js`.

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

# Streaming tokens to stdout
STREAM=true node src/index.js "What is 144 squared?"
```

### Environment variables

| Variable        | Default                          | Description                     |
|-----------------|----------------------------------|---------------------------------|
| `MODEL`         | `onnx-community/Qwen3-0.6B-ONNX` | HF model id                     |
| `DTYPE`         | `q4`                             | `q4` / `q4f16` / `fp32`        |
| `DEVICE`        | `wasm`                           | `wasm` (CPU) or `webgpu` (GPU) |
| `CACHE_DIR`     | `./.cache`                       | Local model cache directory     |
| `MAX_STEPS`     | `8`                              | Max agent iterations            |
| `MAX_NEW_TOKENS`| `512`                            | Tokens per model call           |
| `VERBOSE`       | `true`                           | Show step-by-step logs          |
| `STREAM`        | `false`                          | Stream tokens to stdout         |

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

`Qwen3-0.6B-ONNX` is the confirmed-working model for native tool-calling in
transformers.js v4. Its chat template includes a `tool_use` variant that the
pipeline selects automatically when `tools` are provided.

`Qwen3.5-0.8B-ONNX` is also supported but at q4 dtype may be less reliable
for tool-call token emission. Switch with `MODEL=onnx-community/Qwen3.5-0.8B-ONNX`.

On the Lenovo C13 Yoga (8 GB RAM, Crostini), expect ~15–30 s per model call
at `q4` / `wasm`. The `STREAM=true` flag makes the wait feel much shorter.
