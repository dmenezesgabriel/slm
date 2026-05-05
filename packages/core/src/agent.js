/**
 * src/core/agent.js
 *
 * Agent base class + agentic loop built purely on transformers.js v4.
 * No framework deps — only @huggingface/transformers + your tools.
 *
 * ── How tool-calling works in transformers.js 4.0.0-next.11 ─────────────────
 *
 * The TextGenerationPipeline does NOT natively parse tool calls.  It always
 * returns { role: 'assistant', content: <raw decoded string> }.
 *
 * For Qwen3 the raw string may include:
 *   - <think>…</think>          chain-of-thought block (when thinking is on)
 *   - <tool_call>…</tool_call>  one or more function calls as JSON
 *
 * Neither token is "special" in Qwen3's vocabulary
 *   (<tool_call> id=151657, </tool_call> id=151658,
 *    <think>     id=151667, </think>     id=151668  — all special=false),
 * so skip_special_tokens: true does NOT strip them — we parse them ourselves
 * in _parseReply().
 *
 * ── How tools reach the Jinja chat template ─────────────────────────────────
 *
 * In 4.0.0-next.11 the pipeline routes tokenizer_encode_kwargs directly into
 * apply_chat_template().  Passing tools there triggers the Qwen3 "tool_use"
 * template variant that renders the function schemas into the system prompt.
 *
 * ── How enable_thinking reaches the Jinja template ──────────────────────────
 *
 * apply_chat_template() forwards unknown kwargs to the Jinja renderer.
 * Qwen3's template checks:
 *
 *   {%- if enable_thinking is defined and enable_thinking is false %}
 *       {{- '<think>\n\n</think>\n\n' }}
 *   {%- endif %}
 *
 * Passing enable_thinking: false pre-fills an empty think block so the model
 * skips chain-of-thought entirely — preserving the full token budget for the
 * actual answer.  Passing enable_thinking: true (or omitting it) lets the
 * model reason before answering; thinkingBudget adds headroom for that phase
 * so the answer is never truncated by the reasoning tokens.
 *
 * ── Streaming ────────────────────────────────────────────────────────────────
 *
 * TextStreamer must be imported directly from @huggingface/transformers and
 * passed to model.generate() via the pipeline's generate_kwargs spread.
 * It is NOT a property of the pipeline object (_pipe._TextStreamer does not
 * exist and is always undefined, which silently disables streaming).
 */

import { InterruptableStoppingCriteria, TextStreamer } from "@huggingface/transformers";
import { loadModel } from "./model.js";
import { ToolRuntime } from "./tool-runtime.js";
import { FinalAnswerTool } from "./tools/final-answer.js";

// ── helpers ────────────────────────────────────────────────────────────────────

const DIVIDER = "─".repeat(60);

function log(label, text, verbose) {
  if (!verbose) return;
  console.log(`\n${DIVIDER}\n[${label}]\n${text}`);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new Error("Aborted");
}

// ── Agent ──────────────────────────────────────────────────────────────────────

export class Agent {
  /**
   * @param {object} opts
   * @param {import("./tool.js").Tool[]} opts.tools
   * @param {string}   [opts.model]           HF model id
   * @param {string}   [opts.dtype]           "q4" | "q4f16" | "fp32"
   * @param {string}   [opts.device]          "cpu" | "webgpu"
   * @param {string}   [opts.cacheDir]        cache dir — defaults to ~/.transformers-js/.cache
   * @param {number}   [opts.threads]         ONNX CPU thread count (default: 2)
   * @param {string}   [opts.systemPrompt]    override default system prompt
   * @param {number}   [opts.maxSteps]        max tool-call iterations (default 6)
   * @param {number}   [opts.maxNewTokens]    token budget for the answer / tool-call
   *                                          phase (default 512)
   * @param {boolean}  [opts.enableThinking]  allow Qwen3 chain-of-thought (default false).
   *                                          When true, thinkingBudget extra tokens are
   *                                          added so the answer phase is never starved.
   * @param {number}   [opts.thinkingBudget]  extra tokens reserved for the <think> phase
   *                                          when enableThinking is true (default 512).
   *                                          Raise to 1024+ for hard multi-step problems.
   * @param {boolean}  [opts.verbose]         log step-by-step details
   * @param {boolean}  [opts.stream]          stream tokens to stdout / onToken (default true)
   * @param {Function} [opts.onStep]          called after every agent step
   * @param {Function} [opts.onToken]         called with each streamed token (browser)
   * @param {Function} [opts.onProgress]      called with model download progress events
   */
  constructor(opts = {}) {
    this.model          = opts.model          ?? "onnx-community/Qwen3-0.6B-ONNX";
    this.dtype          = opts.dtype          ?? "q4";
    this.device         = opts.device         ?? "cpu";
    this.cacheDir       = opts.cacheDir;      // undefined → model.js falls back to ~/.transformers-js/.cache
    this.threads        = opts.threads        ?? 2;
    this.maxSteps       = opts.maxSteps       ?? 6;
    this.maxNewTokens   = opts.maxNewTokens   ?? 512;
    this.enableThinking = opts.enableThinking ?? false;
    this.thinkingBudget = opts.thinkingBudget ?? 512;
    this.verbose        = opts.verbose        ?? true;
    this.stream         = opts.stream         ?? true;   // default ON
    this.onStep         = opts.onStep         ?? null;
    this.onToken        = opts.onToken        ?? null;
    this.onProgress     = opts.onProgress     ?? null;
    this.systemPrompt   = opts.systemPrompt   ?? this._defaultSystemPrompt();

    this.tools = opts.tools ?? [];
    this._pipe = null;
  }

  // ── public API ───────────────────────────────────────────────────────────────

  async load() {
    if (this._pipe) return;
    this._pipe = await loadModel({
      model:      this.model,
      dtype:      this.dtype,
      device:     this.device,
      cacheDir:   this.cacheDir,
      threads:    this.threads,
      onProgress: this.onProgress,
    });
  }

  /**
   * Run the agent on a user query without keeping state between calls.
   * @param {string} query
   * @returns {Promise<string>} final answer
   */
  async run(query) {
    const messages = [
      { role: "system", content: this.systemPrompt },
      { role: "user",   content: query },
    ];

    log("User", query, this.verbose);
    return this.runMessages(messages);
  }

  /**
   * Run the agent against caller-owned chat state.
   * The provided messages array is mutated with assistant and tool messages so
   * session owners can persist or reuse the same model-visible context.
   *
   * @param {Array<{ role: string, content: any }>} messages
   * @param {object} [callbacks]
   * @param {Function} [callbacks.onStep]
   * @param {Function} [callbacks.onToken]
   * @returns {Promise<string>} final answer
   */
  async runMessages(messages, callbacks = {}) {
    throwIfAborted(callbacks.signal);
    await this.load();
    throwIfAborted(callbacks.signal);

    const runtimeTools = this._runtimeTools();
    const toolSchemas = runtimeTools.map((t) => t.toOpenAISchema());
    const toolRuntime = new ToolRuntime({
      tools: runtimeTools,
      onToolCall: callbacks.onToolCall,
      onToolResult: callbacks.onToolResult,
    });
    const onStep = callbacks.onStep ?? this.onStep;

    for (let step = 0; step < this.maxSteps; step++) {
      throwIfAborted(callbacks.signal);
      const reply = await this._generate(messages, toolSchemas, callbacks);
      throwIfAborted(callbacks.signal);

      // Guard against an undefined/null reply (e.g. empty generated_text
      // from an unexpected pipeline response shape).
      if (!reply) {
        log("Warning", "_generate returned a falsy reply — stopping", this.verbose);
        return "Model returned an empty response. Try again.";
      }

      // text-only response → done. final_answer is the preferred terminal
      // path for tool-capable models; this fallback keeps plain chat usable.
      if (!reply.tool_calls?.length) {
        messages.push(reply);
        onStep?.({ step, reply, messages: [...messages] });
        const answer = typeof reply.content === "string"
          ? reply.content
          : JSON.stringify(reply.content);
        log("Final Answer", answer, this.verbose);
        return answer;
      }

      log(`Step ${step + 1} — Tool Calls`,
          JSON.stringify(reply.tool_calls, null, 2), this.verbose);

      const toolResult = await toolRuntime.execute(reply.tool_calls);

      if (toolResult.finalAnswer !== null) {
        messages.push(...toolResult.messages);
        const finalReply = { role: "assistant", content: toolResult.finalAnswer };
        messages.push(finalReply);
        onStep?.({ step, reply: finalReply, messages: [...messages] });
        log("Final Answer", toolResult.finalAnswer, this.verbose);
        return toolResult.finalAnswer;
      }

      messages.push(reply, ...toolResult.messages);
      onStep?.({ step, reply, messages: [...messages] });
    }

    return "Reached maximum steps without a final answer. Try a simpler question.";
  }

  // ── private ──────────────────────────────────────────────────────────────────

  async _generate(messages, toolSchemas, callbacks = {}) {
    // ── tokenizer kwargs forwarded to apply_chat_template() ─────────────────
    //
    // In transformers.js 4.0.0-next.11 the pipeline spreads
    // tokenizer_encode_kwargs directly into apply_chat_template(), which is
    // the only path to pass `tools` and `enable_thinking` to the Jinja template.
    const tokenizer_encode_kwargs = {};

    if (toolSchemas.length) {
      // Passes the function schemas into the Qwen3 "tool_use" template
      // variant, rendering them as a <tools>…</tools> block in the prompt.
      tokenizer_encode_kwargs.tools = toolSchemas;
    }

    if (!this.enableThinking) {
      // Tells the Qwen3 template to pre-fill <think>\n\n</think>\n\n at the
      // start of the assistant turn, steering the model to answer directly
      // without generating a reasoning block — preserving the entire token
      // budget for the actual response.
      tokenizer_encode_kwargs.enable_thinking = false;
    }

    // When thinking is on the model consumes thinkingBudget tokens for
    // <think>…</think> before writing the answer / tool call.  We inflate
    // max_new_tokens by that amount so the answer is never cut short.
    const effectiveMaxNewTokens = this.enableThinking
      ? this.maxNewTokens + this.thinkingBudget
      : this.maxNewTokens;

    const genOpts = {
      max_new_tokens: effectiveMaxNewTokens,
      do_sample:      false,
      tokenizer_encode_kwargs: Object.keys(tokenizer_encode_kwargs).length
        ? tokenizer_encode_kwargs
        : undefined,
    };

    const signal = callbacks.signal;
    let abortCriteria = null;
    let abortListener = null;
    if (signal) {
      throwIfAborted(signal);
      abortCriteria = new InterruptableStoppingCriteria();
      abortListener = () => abortCriteria.interrupt();
      signal.addEventListener("abort", abortListener, { once: true });
      genOpts.stopping_criteria = abortCriteria;
    }

    // ── streaming ────────────────────────────────────────────────────────────
    //
    // TextStreamer MUST be imported at the top of this file and instantiated
    // directly — it is NOT a property of the pipeline object.
    // Using `this._pipe._TextStreamer` (which doesn't exist) produces
    // `undefined`, making `if (this.stream && undefined)` always false and
    // silently disabling all streaming.
    if (this.stream) {
      const streamer = new TextStreamer(this._pipe.tokenizer, {
        skip_prompt:         true,
        skip_special_tokens: true,
        // Wrap in try-catch: this callback is called synchronously inside
        // transformers.js internals; an uncaught throw bypasses every
        // promise-level error handler and terminates the process.
        callback_function:   (token) => {
          try {
            const text = typeof token === "string" ? token : String(token ?? "");
            const onToken = callbacks.onToken ?? this.onToken;
            if (onToken) {
              onToken(text);
            } else if (typeof process !== "undefined") {
              process.stdout.write(text);
            }
          } catch (_writeErr) {
            // Ignore broken-pipe / stream-closed errors — the generation
            // result is still returned normally after the streamer finishes.
          }
        },
      });
      genOpts.streamer = streamer;
    }

    try {
      const output    = await this._pipe(messages, genOpts);
      throwIfAborted(signal);
      const generated = output[0].generated_text;
      const raw       = generated[generated.length - 1];

      // Normalise the raw pipeline reply into a properly-structured chat message.
      return this._parseReply(raw);
    } finally {
      if (signal && abortListener) {
        signal.removeEventListener("abort", abortListener);
      }
    }
  }

  /**
   * Normalise the raw pipeline reply into a properly-structured chat message.
   *
   * The TextGenerationPipeline always returns:
   *   { role: 'assistant', content: '<raw decoded string>' }
   *
   * In Qwen3 that raw string may contain:
   *   - <think>…</think>          chain-of-thought (when thinking is on)
   *   - <tool_call>…</tool_call>  one or more JSON function calls
   *
   * Neither token is "special" in Qwen3's vocab, so skip_special_tokens
   * does not strip them — we handle them here.
   *
   * Returned shape matches what the Qwen3 chat template expects for history
   * re-serialisation on subsequent turns:
   *   - text-only:  { role, content: '<answer with thinking stripped>' }
   *   - tool calls: { role, content: '<pre-call text>', tool_calls: [...] }
   *
   * @param {{ role: string, content: string } | undefined} raw
   * @returns {{ role: string, content: string, tool_calls?: object[] }}
   */
  _parseReply(raw) {
    if (!raw || typeof raw.content !== "string") return raw;

    const content = raw.content;

    // ── extract <tool_call>…</tool_call> blocks ──────────────────────────────
    const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    const toolCallMatches = [...content.matchAll(TOOL_CALL_RE)];

    if (toolCallMatches.length === 0) {
      // Pure-text answer: strip the thinking block for a clean reply.
      // The <think> and </think> tokens survive skip_special_tokens because
      // they are NOT marked as special in Qwen3's tokenizer_config.json.
      const cleaned = content
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .trim();
      return { ...raw, content: cleaned };
    }

    // ── parse each tool call ─────────────────────────────────────────────────
    const tool_calls = [];
    for (const m of toolCallMatches) {
      try {
        const j = JSON.parse(m[1]);
        tool_calls.push({
          id:   `call_${tool_calls.length}`,
          type: "function",
          function: {
            name: j.name,
            // Keep arguments as a JSON string — that is what agent.run()
            // passes to JSON.parse() before calling Tool.run().
            arguments: typeof j.arguments === "string"
              ? j.arguments
              : JSON.stringify(j.arguments),
          },
        });
      } catch (_parseErr) {
        // Malformed block: skip it.
      }
    }

    // If every <tool_call> block failed to parse (e.g. all were truncated),
    // fall back to treating the whole reply as plain text so run() returns
    // something meaningful instead of an empty string.
    if (tool_calls.length === 0) {
      const cleaned = content
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .trim();
      return { ...raw, content: cleaned || content.trim() };
    }

    // Remove <tool_call> blocks from content — they are now in tool_calls.
    // Keeping them would produce a garbled prompt when the Qwen3 template
    // re-serialises this message on subsequent turns (it renders tool_calls
    // independently via the {%- for tool_call in message.tool_calls %} loop).
    const contentWithoutCalls = content
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
      .trimEnd();

    return {
      role:       "assistant",
      content:    contentWithoutCalls,   // may include <think>…</think> for history
      tool_calls,
    };
  }

  _runtimeTools() {
    return this.tools.some((tool) => tool.name === "final_answer")
      ? this.tools
      : [...this.tools, new FinalAnswerTool()];
  }

  _defaultSystemPrompt() {
    return [
      "You are a helpful AI assistant with access to tools.",
      "Use tools when they would provide a better answer than your training data.",
      "Be concise and accurate.",
    ].join(" ");
  }
}
