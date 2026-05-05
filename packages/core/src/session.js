/**
 * Stateful agent session.
 *
 * AgentSession owns model-visible message memory and exposes a small evented
 * prompt API for UIs and future SDK consumers. Persistence is supplied through
 * an optional store with an append(entry) method.
 */

const SYSTEM_ROLE = "system";

function systemMessage(content) {
  return { role: SYSTEM_ROLE, content };
}

function userMessage(content) {
  return { role: "user", content };
}

function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function abortError(message = "AgentSession aborted.") {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

export class AgentSession {
  /**
   * @param {object} opts
   * @param {{ systemPrompt?: string, runMessages: Function }} opts.agent
   * @param {Array<{ role: string, content: any }>} [opts.messages]
   * @param {string} [opts.systemPrompt]
   * @param {{ append?: Function }} [opts.store]
   */
  constructor({ agent, messages, systemPrompt, store } = {}) {
    if (!agent || typeof agent.runMessages !== "function") {
      throw new TypeError("AgentSession requires an agent with runMessages(messages, callbacks).");
    }

    this.agent = agent;
    this.store = store ?? null;
    this._listeners = new Set();
    this._abortController = null;
    this._steerQueue = [];
    this._followUpQueue = [];
    this.isRunning = false;

    const prompt = systemPrompt ?? agent.systemPrompt ?? "";
    this.messages = messages
      ? messages.map((m) => ({ ...m }))
      : [systemMessage(prompt)];
  }

  /** Messages intended for display, excluding the system prompt. */
  get visibleMessages() {
    return this.messages.filter((m) => m.role !== SYSTEM_ROLE);
  }

  /** Queued messages, intended for UI display. */
  get queuedMessages() {
    return {
      steer: this._steerQueue.map((item) => item.text),
      followUp: this._followUpQueue.map((item) => item.text),
    };
  }

  /** Reset in-memory conversation while keeping the same system prompt. */
  reset() {
    const currentSystem = this.messages.find((m) => m.role === SYSTEM_ROLE)
      ?? systemMessage(this.agent.systemPrompt ?? "");
    this.messages = [{ ...currentSystem }];
    this._steerQueue = [];
    this._followUpQueue = [];
    this._emit({ type: "reset" });
    this._emitQueueUpdate();
  }

  /** Subscribe to session events. Returns an unsubscribe function. */
  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("AgentSession.subscribe(listener) requires a function.");
    }
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /** Alias for prompt() to mirror Agent.run() naming. */
  async run(text, options) {
    return this.prompt(text, options);
  }

  async steer(text) {
    return this.prompt(text, { streamingBehavior: "steer" });
  }

  async followUp(text) {
    return this.prompt(text, { streamingBehavior: "followUp" });
  }

  abort(reason = abortError()) {
    if (!this.isRunning || !this._abortController) return false;
    this._abortController.abort(reason);
    this._emit({ type: "aborted", reason });
    return true;
  }

  /**
   * Add a user prompt to session memory and run the agent with full context.
   * @param {string} text
   * @param {{ streamingBehavior?: "steer" | "followUp" }} [options]
   * @returns {Promise<string | { queued: true }>}
   */
  async prompt(text, options = {}) {
    if (this.isRunning) {
      return this._queueWhileRunning(text, options.streamingBehavior);
    }

    return this._runPromptAndQueues(text);
  }

  async _runPromptAndQueues(text) {
    this.isRunning = true;
    let firstAnswer;

    try {
      firstAnswer = await this._executePrompt(text);

      while (this._steerQueue.length || this._followUpQueue.length) {
        const next = this._steerQueue.length
          ? this._steerQueue.shift()
          : this._followUpQueue.shift();
        this._emitQueueUpdate();
        await this._executePrompt(next.text);
      }

      return firstAnswer;
    } finally {
      this.isRunning = false;
      this._abortController = null;
    }
  }

  async _executePrompt(text) {
    const message = userMessage(text);
    this.messages.push(message);

    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    this._emit({ type: "prompt_start", prompt: text });
    this._emit({ type: "message", message });

    const assistantStart = this.messages.length;

    try {
      const answer = await this.agent.runMessages(this.messages, {
        signal,
        onToken: (token) => this._emit({ type: "token", token }),
        onToolCall: (event) => this._emit({ type: "tool_call", ...event }),
        onToolResult: (event) => this._emit({ type: "tool_result", ...event }),
      });

      if (signal.aborted) throw signal.reason ?? abortError();

      for (const added of this.messages.slice(assistantStart)) {
        this._emit({ type: "message", message: added });
      }

      this._emit({ type: "assistant_response", content: answer });
      return answer;
    } catch (error) {
      const err = signal.aborted ? (signal.reason ?? abortError()) : asError(error);
      this._emit({ type: "error", error: err });
      throw err;
    } finally {
      this._emit({ type: "prompt_end" });
    }
  }

  _queueWhileRunning(text, behavior) {
    if (behavior === "steer") return this._enqueue("steer", text);
    if (behavior === "followUp") return this._enqueue("followUp", text);
    throw new Error("AgentSession is already running. Use steer() or followUp() to queue a message.");
  }

  _enqueue(queue, text) {
    const item = { text };
    if (queue === "steer") this._steerQueue.push(item);
    else this._followUpQueue.push(item);
    this._emit({ type: "queued_message", queue, text });
    this._emitQueueUpdate();
    return { queued: true };
  }

  _emitQueueUpdate() {
    this._emit({ type: "queue_update", queues: this.queuedMessages });
  }

  _emit(event) {
    this._record(event);
    for (const listener of [...this._listeners]) {
      listener(event);
    }
  }

  _record(event) {
    if (!this.store?.append) return;

    if (event.type === "message") {
      this.store.append({ type: "message", message: event.message });
    } else if (event.type === "tool_call") {
      const { type: _type, ...toolCall } = event;
      this.store.append({ type: "tool_call", toolCall });
    } else if (event.type === "tool_result") {
      const { type: _type, ...toolResult } = event;
      this.store.append({ type: "tool_result", toolResult });
    }
  }
}
