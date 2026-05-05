import { describe, expect, it } from "vitest";
import { Agent } from "./agent.js";

class AbortAwareAgent extends Agent {
  constructor() {
    super({ stream: false, verbose: false });
    this.generateCalls = 0;
  }

  async load() {}

  async _generate() {
    this.generateCalls += 1;
    return { role: "assistant", content: "should not happen" };
  }
}

describe("Agent abort", () => {
  it("does not start generation when the provided signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    const agent = new AbortAwareAgent();

    await expect(agent.runMessages([
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: "hello" },
    ], { signal: controller.signal })).rejects.toThrow("stop");

    expect(agent.generateCalls).toBe(0);
  });
});
