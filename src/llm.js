/**
 * src/llm.js
 *
 * Bridges transformers.js v4 (ONNX inference) with LangChain's BaseChatModel contract.
 * Singleton pipeline so the model loads only once per process.
 *
 * Requires @huggingface/transformers ^4.0.0 — Qwen3.5 support was added in v4.
 *
 * Tested models (text-generation, CPU, q4):
 *   - onnx-community/Qwen3.5-0.8B-ONNX   (~450 MB, primary)
 *   - onnx-community/Qwen3-0.6B-ONNX     (~350 MB, fallback)
 */

import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";

// ── singleton ──────────────────────────────────────────────────────────────────

let _pipeline = null;

async function getPipeline(model, dtype, cacheDir) {
  if (_pipeline) return _pipeline;

  const { pipeline, env } = await import("@huggingface/transformers");

  if (cacheDir) env.cacheDir = cacheDir;

  console.error(`[llm] loading model : ${model}`);
  console.error(`[llm] dtype         : ${dtype}`);
  console.error("[llm] first run downloads model weights, subsequent runs use cache");

  _pipeline = await pipeline("text-generation", model, { dtype });
  console.error("[llm] model ready ✓");
  return _pipeline;
}

// ── output extractor ───────────────────────────────────────────────────────────

/**
 * transformers.js v4 text-generation returns one of two shapes:
 *
 *  Chat-template path (messages[] input):
 *    result[0].generated_text  →  Array<{role, content}>
 *    The last item is the new assistant turn.
 *
 *  Plain string path:
 *    result[0].generated_text  →  string
 *
 * This function handles both.
 */
function extractText(result) {
  const gen = result?.[0]?.generated_text;
  if (!gen) return "";

  if (Array.isArray(gen)) {
    // Chat template path — last entry is the assistant reply
    const last = gen[gen.length - 1];
    return typeof last === "string" ? last : (last?.content ?? "");
  }

  return String(gen);
}

// ── LangChain wrapper ──────────────────────────────────────────────────────────

export class TransformersJSChatModel extends BaseChatModel {
  /**
   * @param {{
   *   model?: string,
   *   dtype?: string,
   *   cacheDir?: string,
   *   maxNewTokens?: number,
   *   temperature?: number,
   *   doSample?: boolean,
   * }} fields
   */
  constructor(fields = {}) {
    super(fields);
    this.model = fields.model ?? "onnx-community/Qwen3.5-0.8B-ONNX";
    this.dtype = fields.dtype ?? "q4";
    this.cacheDir = fields.cacheDir ?? "./.cache";
    this.maxNewTokens = fields.maxNewTokens ?? 512;
    this.temperature = fields.temperature ?? 0.1;
    this.doSample = fields.doSample ?? false;
  }

  _llmType() {
    return "transformers-js";
  }

  /**
   * Core generation method called by LangChain.
   * Converts BaseMessage[] → chat messages array → AIMessage.
   */
  async _generate(messages, _options) {
    const pipe = await getPipeline(this.model, this.dtype, this.cacheDir);

    // Map LangChain message types to the role strings Qwen expects
    const chatMessages = messages.map((m) => {
      const type = m._getType();
      const role =
        type === "human" ? "user" : type === "system" ? "system" : "assistant";
      return { role, content: String(m.content) };
    });

    const result = await pipe(chatMessages, {
      max_new_tokens: this.maxNewTokens,
      temperature: this.temperature,
      do_sample: this.doSample,
    });

    const text = extractText(result);

    return {
      generations: [
        {
          message: new AIMessage(text),
          text,
        },
      ],
    };
  }
}