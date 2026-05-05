import { describe, expect, it } from "vitest";
import { Agent } from "./agent.js";

class ToolCallingAgent extends Agent {
  constructor(reply) {
    super({ stream: false, verbose: false });
    this.reply = reply;
    this.contexts = [];
  }

  async load() {}

  async _generate(messages, toolSchemas) {
    this.contexts.push({
      messages: messages.map((m) => ({ ...m })),
      toolSchemas,
    });
    return this.reply;
  }
}

describe("Agent final_answer tool", () => {
  it("injects the final_answer tool schema into every agent run", async () => {
    const agent = new ToolCallingAgent({ role: "assistant", content: "plain" });

    await agent.runMessages([
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: "hi" },
    ]);

    expect(agent.contexts[0].toolSchemas.map((schema) => schema.function.name)).toContain("final_answer");
  });

  it("stops and stores assistant text when the model calls final_answer", async () => {
    const agent = new ToolCallingAgent({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call_0",
          type: "function",
          function: {
            name: "final_answer",
            arguments: JSON.stringify({ answer: "Created hello.py" }),
          },
        },
      ],
    });
    const messages = [
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: "create a file" },
    ];

    const answer = await agent.runMessages(messages);

    expect(answer).toBe("Created hello.py");
    expect(agent.contexts).toHaveLength(1);
    expect(messages.map((m) => [m.role, m.content])).toEqual([
      ["system", agent.systemPrompt],
      ["user", "create a file"],
      ["assistant", "Created hello.py"],
    ]);
  });
});
