import { describe, expect, it } from "vitest";
import { AgentSession } from "./session.js";

describe("AgentSession resumed memory", () => {
  it("sends resumed messages back into model-visible context", async () => {
    const contexts = [];
    const agent = {
      systemPrompt: "System prompt",
      async runMessages(messages) {
        contexts.push(messages.map((m) => ({ ...m })));
        messages.push({ role: "assistant", content: "new answer" });
        return "new answer";
      },
    };
    const session = new AgentSession({
      agent,
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: "old question" },
        { role: "assistant", content: "old answer" },
      ],
    });

    await session.prompt("new question");

    expect(contexts[0].map((m) => [m.role, m.content])).toEqual([
      ["system", "System prompt"],
      ["user", "old question"],
      ["assistant", "old answer"],
      ["user", "new question"],
    ]);
  });
});
