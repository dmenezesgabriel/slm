import { describe, expect, it } from "vitest";
import { AgentSession } from "./session.js";

function makeAgent() {
  const capturedContexts = [];
  return {
    systemPrompt: "System prompt",
    capturedContexts,
    async runMessages(messages, { onToken } = {}) {
      capturedContexts.push(messages.map((m) => ({ ...m })));
      onToken?.("token");
      const userCount = messages.filter((m) => m.role === "user").length;
      const answer = `answer ${userCount}`;
      messages.push({ role: "assistant", content: answer });
      return answer;
    },
  };
}

describe("AgentSession", () => {
  it("keeps previous user and assistant turns in model-visible context", async () => {
    const agent = makeAgent();
    const session = new AgentSession({ agent });

    await session.prompt("first");
    await session.prompt("second");

    expect(agent.capturedContexts[0].map((m) => [m.role, m.content])).toEqual([
      ["system", "System prompt"],
      ["user", "first"],
    ]);

    expect(agent.capturedContexts[1].map((m) => [m.role, m.content])).toEqual([
      ["system", "System prompt"],
      ["user", "first"],
      ["assistant", "answer 1"],
      ["user", "second"],
    ]);
  });

  it("exposes display history from session state without the system prompt", async () => {
    const session = new AgentSession({ agent: makeAgent() });

    await session.prompt("hello");

    expect(session.visibleMessages.map((m) => [m.role, m.content])).toEqual([
      ["user", "hello"],
      ["assistant", "answer 1"],
    ]);
  });

  it("emits stable prompt, token, assistant, completion, and error events", async () => {
    const session = new AgentSession({ agent: makeAgent() });
    const events = [];
    const unsubscribe = session.subscribe((event) => events.push(event));

    await session.prompt("hello");
    unsubscribe();
    await session.prompt("ignored by unsubscribed listener");

    expect(events.map((e) => e.type)).toEqual([
      "prompt_start",
      "message",
      "token",
      "message",
      "assistant_response",
      "prompt_end",
    ]);
    expect(events[1].message).toMatchObject({ role: "user", content: "hello" });
    expect(events[2]).toMatchObject({ type: "token", token: "token" });
    expect(events[3].message).toMatchObject({ role: "assistant", content: "answer 1" });
    expect(events[4]).toMatchObject({ type: "assistant_response", content: "answer 1" });
  });

  it("emits an error event and clears running state when the agent fails", async () => {
    const failingAgent = {
      systemPrompt: "System prompt",
      async runMessages() {
        throw new Error("boom");
      },
    };
    const session = new AgentSession({ agent: failingAgent });
    const events = [];
    session.subscribe((event) => events.push(event));

    await expect(session.prompt("fail")).rejects.toThrow("boom");

    expect(session.isRunning).toBe(false);
    expect(events.map((e) => e.type)).toEqual([
      "prompt_start",
      "message",
      "error",
      "prompt_end",
    ]);
    expect(events[2].error.message).toBe("boom");
  });
});
