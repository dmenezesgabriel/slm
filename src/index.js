/**
 * src/index.js
 *
 * Demo entry point.
 *
 * Usage:
 *   node src/index.js                        # run all demo queries
 *   node src/index.js "your question here"   # single query
 *
 * Env vars:
 *   MODEL            HF model id          (default: onnx-community/Qwen3-0.6B-ONNX)
 *   DTYPE            quantisation         (default: q4)
 *   DEVICE           wasm | webgpu        (default: wasm)
 *   CACHE_DIR        local model cache    (default: ./.cache)
 *   MAX_STEPS        agent iterations     (default: 8)
 *   MAX_NEW_TOKENS   tokens per call      (default: 512)
 *   VERBOSE          true | false         (default: true)
 *   STREAM           stream tokens        (default: false)
 *   THREADS          ONNX CPU threads     (default: 2)  — raise on machines with >8 GB RAM
 */

import { Agent } from "./core/agent.js";
import {
  CalculatorTool,
  DateTimeTool,
  WikipediaTool,
  WeatherTool,
} from "./tools/index.js";

// ── config ─────────────────────────────────────────────────────────────────────

const CONFIG = {
  model:        process.env.MODEL         ?? "onnx-community/Qwen3-0.6B-ONNX",
  dtype:        process.env.DTYPE         ?? "q4",
  device:       process.env.DEVICE        ?? "cpu",
  cacheDir:     process.env.CACHE_DIR     ?? "./.cache",
  maxSteps:     Number(process.env.MAX_STEPS      ?? 8),
  maxNewTokens: Number(process.env.MAX_NEW_TOKENS ?? 512),
  verbose:      process.env.VERBOSE       !== "false",
  stream:       process.env.STREAM        === "true",
  threads:      Number(process.env.THREADS       ?? 2),
};

// ── demo queries ───────────────────────────────────────────────────────────────

const DEMO_QUERIES = [
  "What is the square root of 1764, then add 42 to the result?",
  "What time and date is it right now?",
  "Give me a one-sentence summary of the Qwen language model family.",
  "What is the weather like in Indaiatuba, São Paulo right now?",
  "Calculate (17 * 23) - 144, then square that result.",
];

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  const agent = new Agent({
    ...CONFIG,
    tools: [
      new CalculatorTool(),
      new DateTimeTool(),
      new WikipediaTool(),
      new WeatherTool(),
    ],
  });

  const queries = process.argv[2] ? [process.argv[2]] : DEMO_QUERIES;

  for (const query of queries) {
    const banner = "═".repeat(70);
    console.log(`\n${banner}`);
    console.log(`QUERY: ${query}`);
    console.log(banner);

    try {
      const answer = await agent.run(query);
      if (CONFIG.stream) process.stdout.write("\n");
      console.log(`\n✓ ${answer}`);
    } catch (err) {
      console.error(`✗ ERROR: ${err.message}`);
      if (CONFIG.verbose) console.error(err.stack);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
