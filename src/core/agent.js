/**
 * src/core/agent.js
 *
 * Agent base class + agentic loop built purely on transformers.js v4.
 * No framework deps — only @huggingface/transformers + your tools.
 *
 * ── Model-specific behavior ─────────────────────────────────────────────────
 *
 * TextGenerationPipeline returns assistant content as decoded text; tool-call
 * markers differ by model family and may be stripped by `skip_special_tokens`.
 * Agent delegates all model-specific prompt kwargs, token budgeting, and reply
 * parsing to strategies selected by `createModelStrategy(model)`.
 *
 * Adding a new model family should require a new strategy + factory registry
 * entry, not changes to the Agent loop.
 *
 * ── Streaming ────────────────────────────────────────────────────────────────
 *
 * TextStreamer must be imported directly from @huggingface/transformers and
 * passed to model.generate() via the pipeline's generate_kwargs spread.
 * It is NOT a property of the pipeline object (_pipe._TextStreamer does not
 * exist and is always undefined, which silently disables streaming).
 */

import { TextStreamer } from "@huggingface/transformers";
import { loadModel } from "./model.js";
import { createModelStrategy } from "./model-strategies/factory.js";
import { HeuristicToolRouter } from "./tool-routing/heuristic-router.js";

// ── helpers ────────────────────────────────────────────────────────────────────

const DIVIDER = "─".repeat(60);

function log(label, text, verbose) {
  if (!verbose) return;
  console.log(`\n${DIVIDER}\n[${label}]\n${text}`);
}

/**
 * Cap tool result length before appending to messages.
 * Uncapped results from e.g. Wikipedia can be several KB each;
 * multiplied by maxSteps they push context into swap territory on 8 GB machines.
 */
function truncate(str, maxChars = 1200) {
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + `… [truncated ${str.length - maxChars} chars]`;
}

function toolResultMessage(toolCallId, toolName, result) {
  return {
    role: "tool",
    name: toolName,
    tool_call_id: toolCallId,
    content: truncate(result),
  };
}

// ── Agent ──────────────────────────────────────────────────────────────────────

export class Agent {
  /**
   * @param {object} opts
   * @param {import("./tool.js").Tool[]} opts.tools
   * @param {string}   [opts.model]           HF model id
   * @param {string}   [opts.dtype]           "q4" | "q4f16" | "fp32"
   * @param {string}   [opts.device]          "cpu" | "webgpu"
   * @param {string}   [opts.cacheDir]        local cache dir (Node)
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
   * @param {object}   [opts.strategy]        optional model strategy override
   * @param {object}   [opts.toolRouter]      optional high-confidence fallback tool router
   */
  constructor(opts = {}) {
    this.model          = opts.model          ?? "onnx-community/functiongemma-270m-it-ONNX";
    this.dtype          = opts.dtype          ?? "q4";
    this.device         = opts.device         ?? "cpu";
    this.cacheDir       = opts.cacheDir       ?? "./.cache";
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

    this.strategy   = opts.strategy   ?? createModelStrategy(this.model);
    this.toolRouter = opts.toolRouter ?? new HeuristicToolRouter();
    this.tools      = opts.tools ?? [];
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
      threads:    this.threads,
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

    // messages is local to this call — no state bleeds between runs
    const messages = [
      { role: "system", content: this.systemPrompt },
      { role: "user",   content: query },
    ];

    log("User", query, this.verbose);

    let routedFallbackUsed = false;

    for (let step = 0; step < this.maxSteps; step++) {
      const reply = await this._generate(messages, toolSchemas);

      // Guard against an undefined/null reply (e.g. empty generated_text
      // from an unexpected pipeline response shape).
      if (!reply) {
        log("Warning", "_generate returned a falsy reply — stopping", this.verbose);
        return "Model returned an empty response. Try again.";
      }

      if (!reply.tool_calls?.length && !routedFallbackUsed) {
        const planned = this.toolRouter?.plan?.({ query, tools: this.tools, reply }) ?? [];
        if (planned.length > 0) {
          routedFallbackUsed = true;
          const routedReply = { role: "assistant", content: "", tool_calls: planned };
          log("Router Fallback", JSON.stringify(planned, null, 2), this.verbose);
          messages.push(routedReply);
          this.onStep?.({ step, reply: routedReply, messages: [...messages] });
          const observations = await this._executeToolCalls(routedReply.tool_calls, messages);
          if (this.toolRouter.shouldReturnDirect?.({ query, toolCalls: routedReply.tool_calls, observations })) {
            const answer = observations.map((obs) => obs.result).join("\n");
            log("Final Answer", answer, this.verbose);
            return answer;
          }
          continue;
        }
      }

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

      await this._executeToolCalls(reply.tool_calls, messages, step);
    }

    return "Reached maximum steps without a final answer. Try a simpler question.";
  }

  // ── private ──────────────────────────────────────────────────────────────────

  async _executeToolCalls(toolCalls, messages, step = null) {
    const observations = [];

    if (step !== null) {
      log(`Step ${step + 1} — Tool Calls`, JSON.stringify(toolCalls, null, 2), this.verbose);
    }

    for (const call of toolCalls) {
      const { name, arguments: rawArgs } = call.function;

      // JSON.parse can throw when the model hits max_new_tokens mid-generation
      // and the JSON string is truncated. Treat a parse failure as a tool error
      // so the loop can recover gracefully.
      let args;
      try {
        args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
      } catch (parseErr) {
        const msg = `Bad tool-call JSON for "${name}": ${parseErr.message}`;
        log("Tool Parse Error", msg, this.verbose);
        messages.push(toolResultMessage(call.id ?? name, name, msg));
        observations.push({ call, name, args: null, result: msg, ok: false });
        continue;
      }

      const tool = this._toolMap[name];
      if (!tool) {
        const err = `Unknown tool: "${name}". Available: ${Object.keys(this._toolMap).join(", ")}`;
        log("Tool Error", err, this.verbose);
        messages.push(toolResultMessage(call.id ?? name, name, err));
        observations.push({ call, name, args, result: err, ok: false });
        continue;
      }

      log(`Tool: ${name}`, JSON.stringify(args), this.verbose);
      const result = await tool.run(args);
      log("Observation", result, this.verbose);

      messages.push(toolResultMessage(call.id ?? name, name, result));
      observations.push({ call, name, args, result, ok: true });
    }

    return observations;
  }

  async _generate(messages, toolSchemas) {
    const tokenizer_encode_kwargs = this.strategy.getTokenizerEncodeKwargs({
      toolSchemas,
      enableThinking: this.enableThinking,
    });

    const genOpts = {
      max_new_tokens: this.strategy.getEffectiveMaxNewTokens({
        maxNewTokens: this.maxNewTokens,
        enableThinking: this.enableThinking,
        thinkingBudget: this.thinkingBudget,
      }),
      do_sample: false,
      tokenizer_encode_kwargs,
    };

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
            if (this.onToken) {
              this.onToken(text);
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

    const output    = await this._pipe(messages, genOpts);
    const generated = output[0].generated_text;
    const raw       = generated[generated.length - 1];

    // Normalise the raw pipeline reply into a properly-structured chat message.
    return this._parseReply(raw);
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
    return this.strategy.parseReply(raw);
  }

  _defaultSystemPrompt() {
    return [
      "You are a helpful AI assistant with access to tools.",
      "Use tools when they would provide a better answer than your training data.",
      "For arithmetic, current date/time, weather, or Wikipedia lookups, call the matching tool instead of guessing.",
      "After receiving a tool result, answer the user concisely and accurately.",
    ].join(" ");
  }
}