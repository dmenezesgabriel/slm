/**
 * src/index.js
 *
 * Entry point for the local ReAct agent.
 *
 * Usage:
 *   node src/index.js                    # runs built-in demo queries
 *   node src/index.js "your question"    # single query from CLI arg
 *
 * Environment variables:
 *   MODEL_CACHE_DIR   - where to store ONNX weights (default: ./.cache)
 *   MODEL_DTYPE       - quantisation: q4 | q8 | fp32 (default: q4)
 *   MAX_NEW_TOKENS    - token budget per model call (default: 512)
 *   MAX_ITERATIONS    - agent reasoning steps (default: 8)
 *   VERBOSE           - set to "false" to suppress step-by-step logs
 */

import { TransformersJSChatModel } from "./llm.js";
import { ReactAgent } from "./agent.js";
import { ALL_TOOLS } from "./tools.js";

// ── Config ─────────────────────────────────────────────────────────────────────

const CONFIG = {
  model: "onnx-community/Qwen3.5-0.8B-ONNX",
  dtype: process.env.MODEL_DTYPE ?? "q4",
  cacheDir: process.env.MODEL_CACHE_DIR ?? "./.cache",
  maxNewTokens: parseInt(process.env.MAX_NEW_TOKENS ?? "512", 10),
  maxIterations: parseInt(process.env.MAX_ITERATIONS ?? "8", 10),
  verbose: process.env.VERBOSE !== "false",
};

// ── Demo queries ───────────────────────────────────────────────────────────────

const DEMO_QUERIES = [
  "What is the square root of 1764 plus 42?",
  "What is today's date and time?",
  "Give me a one-sentence summary of the Python programming language.",
  "What is the weather like in São Paulo right now?",
  "What is (17 * 23) - 144? Then tell me what the result squared is.",
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const llm = new TransformersJSChatModel({
    model: CONFIG.model,
    dtype: CONFIG.dtype,
    cacheDir: CONFIG.cacheDir,
    maxNewTokens: CONFIG.maxNewTokens,
    doSample: false,
    temperature: 0.1,
  });

  const agent = new ReactAgent(llm, ALL_TOOLS, {
    maxIterations: CONFIG.maxIterations,
    verbose: CONFIG.verbose,
  });

  // CLI arg overrides demo queries
  const cliQuery = process.argv[2];
  const queries = cliQuery ? [cliQuery] : DEMO_QUERIES;

  for (const query of queries) {
    const banner = "═".repeat(70);
    console.log(`\n${banner}`);
    console.log(`QUERY: ${query}`);
    console.log(banner);

    try {
      const answer = await agent.run(query);
      console.log(`\n✓ ANSWER: ${answer}`);
    } catch (err) {
      console.error(`✗ ERROR: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
