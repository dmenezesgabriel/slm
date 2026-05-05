/**
 * Stateful agent session.
 *
 * AgentSession owns model-visible message memory and exposes a small evented
 * prompt API for UIs and future SDK consumers. Persistence, branching, tool
 * policy, and compaction are intentionally left to later vertical slices.
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

export class AgentSession {
  /**
   * @param {object} opts
   * @param {{ systemPrompt?: string, runMessages: Function }} opts.agent
   * @param {Array<{ role: string, content: any }>} [opts.messages]
   * @param {string} [opts.systemPrompt]
   */
  constructor({ agent, messages, systemPrompt } = {}) {
    if (!agent || typeof agent.runMessages !== "function") {
      throw new TypeError("AgentSession requires an agent with runMessages(messages, callbacks).");
    }

    this.agent = agent;
    this._listeners = new Set();
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

  /** Reset in-memory conversation while keeping the same system prompt. */
  reset() {
    const currentSystem = this.messages.find((m) => m.role === SYSTEM_ROLE)
      ?? systemMessage(this.agent.systemPrompt ?? "");
    this.messages = [{ ...currentSystem }];
    this._emit({ type: "reset" });
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

  /**
   * Add a user prompt to session memory and run the agent with full context.
   * @param {string} text
   * @returns {Promise<string>} final answer
   */
  async prompt(text) {
    if (this.isRunning) {
      throw new Error("AgentSession is already running.");
    }

    const message = userMessage(text);
    this.isRunning = true;
    this.messages.push(message);

    this._emit({ type: "prompt_start", prompt: text });
    this._emit({ type: "message", message });

    const assistantStart = this.messages.length;

    try {
      const answer = await this.agent.runMessages(this.messages, {
        onToken: (token) => this._emit({ type: "token", token }),
      });

      for (const added of this.messages.slice(assistantStart)) {
        this._emit({ type: "message", message: added });
      }

      this._emit({ type: "assistant_response", content: answer });
      return answer;
    } catch (error) {
      const err = asError(error);
      this._emit({ type: "error", error: err });
      throw err;
    } finally {
      this.isRunning = false;
      this._emit({ type: "prompt_end" });
    }
  }

  _emit(event) {
    for (const listener of [...this._listeners]) {
      listener(event);
    }
  }
}
