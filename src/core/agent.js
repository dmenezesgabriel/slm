/**
 * src/core/agent.js
 *
 * Agent base class + agentic loop built purely on transformers.js v4.
 * No framework deps — only @huggingface/transformers + your tools.
 *
 * Streaming: opt-in via opts.stream = true.
 * TextStreamer is imported directly from the library (top-level import),
 * not smuggled through the pipeline object.
 */

import { TextStreamer } from "@huggingface/transformers";
import { loadModel } from "./model.js";

// ── helpers ────────────────────────────────────────────────────────────────────

const DIVIDER = "─".repeat(60);

function log(label, text, verbose) {
  if (!verbose) return;
  console.log(`\n${DIVIDER}\n[${label}]\n${text}`);
}

function toolResultMessage(toolCallId, result) {
  return {
    role:         "tool",
    tool_call_id: toolCallId,
    content:      result,
  };
}

// ── Agent ──────────────────────────────────────────────────────────────────────

export class Agent {
  /**
   * @param {object} opts
   * @param {import("./tool.js").Tool[]} opts.tools
   * @param {string}   [opts.model]         HF model id
   * @param {string}   [opts.dtype]         "q4" | "q4f16" | "fp32"
   * @param {string}   [opts.device]        "cpu" | "webgpu"
   * @param {string}   [opts.cacheDir]      local cache dir (Node)
   * @param {string}   [opts.systemPrompt]  override default system prompt
   * @param {number}   [opts.maxSteps]      max tool-call iterations (default 8)
   * @param {number}   [opts.maxNewTokens]  token budget per model call (default 512)
   * @param {boolean}  [opts.verbose]       log step-by-step details
   * @param {boolean}  [opts.stream]        stream tokens to stdout / onToken
   * @param {Function} [opts.onStep]        called after every agent step
   * @param {Function} [opts.onToken]       called with each streamed token (browser)
   * @param {Function} [opts.onProgress]    called with model download progress events
   */
  constructor(opts = {}) {
    this.model        = opts.model        ?? "onnx-community/Qwen3-0.6B-ONNX";
    this.dtype        = opts.dtype        ?? "q4";
    this.device       = opts.device       ?? "cpu";
    this.cacheDir     = opts.cacheDir     ?? "./.cache";
    this.maxSteps     = opts.maxSteps     ?? 8;
    this.maxNewTokens = opts.maxNewTokens ?? 512;
    this.verbose      = opts.verbose      ?? true;
    this.stream       = opts.stream       ?? false;
    this.onStep       = opts.onStep       ?? null;
    this.onToken      = opts.onToken      ?? null;
    this.onProgress   = opts.onProgress   ?? null;
    this.systemPrompt = opts.systemPrompt ?? this._defaultSystemPrompt();

    this.tools    = opts.tools ?? [];
    this._toolMap = Object.fromEntries(this.tools.map((t) => [t.name, t]));
    this._pipe    = null;
  }

  // ── public API ───────────────────────────────────────────────────────────────

  async load() {
    if (this._pipe) return;
    this._pipe = await loadModel({
      model:      this.model,
      dtype:      this.dtype,
      device:     this.device,
      cacheDir:   this.cacheDir,
      onProgress: this.onProgress,
    });
  }

  /**
   * Run the agent on a user query.
   * @param {string} query
   * @returns {Promise<string>} final answer
   */
  async run(query) {
    await this.load();

    const toolSchemas = this.tools.map((t) => t.toOpenAISchema());
    const messages    = [
      { role: "system", content: this.systemPrompt },
      { role: "user",   content: query },
    ];

    log("User", query, this.verbose);

    for (let step = 0; step < this.maxSteps; step++) {
      const reply = await this._generate(messages, toolSchemas);

      messages.push(reply);
      this.onStep?.({ step, reply, messages: [...messages] });

      // text-only response → done
      if (!reply.tool_calls?.length) {
        const answer = typeof reply.content === "string"
          ? reply.content
          : JSON.stringify(reply.content);
        log("Final Answer", answer, this.verbose);
        return answer;
      }

      log(`Step ${step + 1} — Tool Calls`, JSON.stringify(reply.tool_calls, null, 2), this.verbose);

      for (const call of reply.tool_calls) {
        const { name, arguments: rawArgs } = call.function;
        const args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;

        const tool = this._toolMap[name];
        if (!tool) {
          const err = `Unknown tool: "${name}". Available: ${Object.keys(this._toolMap).join(", ")}`;
          log("Tool Error", err, this.verbose);
          messages.push(toolResultMessage(call.id ?? name, err));
          continue;
        }

        log(`Tool: ${name}`, JSON.stringify(args), this.verbose);
        const result = await tool.run(args);
        log("Observation", result, this.verbose);

        messages.push(toolResultMessage(call.id ?? name, result));
      }
    }

    return "Reached maximum steps without a final answer. Try a simpler question.";
  }

  // ── private ──────────────────────────────────────────────────────────────────

  async _generate(messages, toolSchemas) {
    const genOpts = {
      max_new_tokens: this.maxNewTokens,
      do_sample:      false,
      tools:          toolSchemas.length ? toolSchemas : undefined,
    };

    if (this.stream) {
      // TextStreamer is imported at the top of this file — no smuggling needed.
      // skip_special_tokens: true suppresses <|im_start|> etc.
      // When tools are active the model may emit tool-call tokens silently;
      // the streamer only fires on decoded text tokens.
      const streamer = new TextStreamer(this._pipe.tokenizer, {
        skip_prompt:         true,
        skip_special_tokens: true,
        callback_function:   (token) => {
          if (this.onToken) {
            this.onToken(token);
          } else if (typeof process !== "undefined") {
            process.stdout.write(token);
          }
        },
      });
      genOpts.streamer = streamer;
    }

    const output    = await this._pipe(messages, genOpts);
    const generated = output[0].generated_text;
    return generated[generated.length - 1];
  }

  _defaultSystemPrompt() {
    return [
      "You are a helpful AI assistant with access to tools.",
      "Use tools when they would provide a better answer than your training data.",
      "Be concise and accurate.",
    ].join(" ");
  }
}
