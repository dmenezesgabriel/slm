# local-agent

A fully local AI agent running **Qwen3.5-0.8B** (ONNX / 4-bit quantised) via
**transformers.js** in Node.js, orchestrated with **LangChain.js** using a
hand-rolled **ReAct (Reason + Act)** loop.

No API keys. No Python. No GPU required. ~500 MB of model weights.

---

## Architecture

```
index.js
  └─ ReactAgent (agent.js)
       ├─ TransformersJSChatModel (llm.js)   ← wraps transformers.js pipeline
       │    └─ onnx-community/Qwen3.5-0.8B-ONNX  ← ONNX runtime inference
       └─ Tools (tools.js)
            ├─ calculator      — safe math evaluator (no eval)
            ├─ get_date_time   — current local date/time
            ├─ wikipedia       — Wikipedia REST summary API
            └─ get_weather     — Open-Meteo (free, no API key)
```

### ReAct Loop

```
System prompt (tools description)
  → HumanMessage (user query)
  → Model generates:  Thought / Action / Action Input
  → Tool runs, returns Observation
  → HumanMessage (observation)
  → Model generates next step  …
  → Model generates:  Thought / Final Answer
```

The loop runs for up to `MAX_ITERATIONS` steps (default 8).

### Why a custom `BaseChatModel` instead of LangChain's built-in?

LangChain.js has no first-party transformers.js LLM wrapper (only embeddings).
`TransformersJSChatModel` extends `BaseChatModel`, making the local model a
drop-in for any LangChain runnable or chain — you can swap it for GPT-4 or
Claude without touching the agent code.

---

## Requirements

- Node.js ≥ 18
- ~1 GB free disk space (model cache)
- ~2–3 GB RAM at runtime (q4 quantisation)
- Internet access on first run (to download model weights)

---

## Setup

```bash
npm install
```

---

## Usage

```bash
# Run built-in demo queries
npm start

# Single question
node src/index.js "What is the capital of Brazil and what is its population?"

# Quiet mode (suppress step logs, only show final answers)
VERBOSE=false node src/index.js "What is 144 * 7?"
```

### Environment variables

| Variable          | Default                              | Description                            |
|-------------------|--------------------------------------|----------------------------------------|
| `MODEL_CACHE_DIR` | `./.cache`                           | Where to store downloaded ONNX weights |
| `MODEL_DTYPE`     | `q4`                                 | Quantisation: `q4`, `q8`, `fp32`       |
| `MAX_NEW_TOKENS`  | `512`                                | Token budget per model call            |
| `MAX_ITERATIONS`  | `8`                                  | Maximum reasoning steps                |
| `VERBOSE`         | `true`                               | Show Thought/Action/Observation logs   |

---

## Adding your own tools

```js
// src/tools.js
export const myTool = {
  name: "my_tool",
  description: "Does X. Input: a Y string.",
  schema: "A Y string.",

  async run(input) {
    // ... your logic
    return "result string";
  },
};

// then add it to ALL_TOOLS
export const ALL_TOOLS = [..., myTool];
```

That's it — the agent picks up new tools automatically from the system prompt.

---

## Notes on Qwen3.5-0.8B

- It's a 0.8 B parameter instruction-tuned model; reasoning quality is limited
  compared to larger models. For best results, keep questions concrete.
- The `q4` dtype halves RAM vs `fp32` with minimal quality loss for this use case.
- First run downloads ~450 MB; subsequent runs load from `./.cache`.
- On the Lenovo C13 Yoga (8 GB RAM, Crostini), expect ~15–30 s per model call.

---

## Extending to a multi-step pipeline

The `ReactAgent` is a plain class — wire it into anything:

```js
import { ReactAgent } from "./src/agent.js";
import { TransformersJSChatModel } from "./src/llm.js";
import { ALL_TOOLS } from "./src/tools.js";

const llm   = new TransformersJSChatModel({ dtype: "q4" });
const agent = new ReactAgent(llm, ALL_TOOLS);

const answer = await agent.run("What is 2 + 2?");
```
