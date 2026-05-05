import { describe, expect, it } from "vitest";
import { Agent } from "./agent.js";

class RecordingAgent extends Agent {
  constructor(opts) {
    super({ ...opts, stream: false, verbose: false });
    this.contexts = [];
  }

  async load() {}

  async _generate(messages) {
    this.contexts.push(messages.map((m) => ({ ...m })));
    return { role: "assistant", content: `reply ${this.contexts.length}` };
  }
}

describe("Agent state boundaries", () => {
  it("keeps run(query) stateless for one-shot calls", async () => {
    const agent = new RecordingAgent();

    await agent.run("first");
    await agent.run("second");

    expect(agent.contexts[0].map((m) => [m.role, m.content])).toEqual([
      ["system", agent.systemPrompt],
      ["user", "first"],
    ]);
    expect(agent.contexts[1].map((m) => [m.role, m.content])).toEqual([
      ["system", agent.systemPrompt],
      ["user", "second"],
    ]);
  });

  it("runMessages(messages) appends assistant output to caller-owned state", async () => {
    const agent = new RecordingAgent();
    const messages = [
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: "first" },
    ];

    const answer = await agent.runMessages(messages);

    expect(answer).toBe("reply 1");
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ["system", agent.systemPrompt],
      ["user", "first"],
      ["assistant", "reply 1"],
    ]);
  });
});
