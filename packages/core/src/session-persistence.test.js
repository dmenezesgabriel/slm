import { describe, expect, it } from "vitest";
import { AgentSession } from "./session.js";

function makeStore() {
  return {
    entries: [],
    append(entry) {
      this.entries.push(entry);
    },
  };
}

describe("AgentSession persistence", () => {
  it("records user and assistant messages through the session store", async () => {
    const store = makeStore();
    const agent = {
      systemPrompt: "System prompt",
      async runMessages(messages) {
        messages.push({ role: "assistant", content: "remembered" });
        return "remembered";
      },
    };

    await new AgentSession({ agent, store }).prompt("remember me");

    expect(store.entries).toEqual([
      { type: "message", message: { role: "user", content: "remember me" } },
      { type: "message", message: { role: "assistant", content: "remembered" } },
    ]);
  });

  it("records tool call and tool result entries through the session store", async () => {
    const store = makeStore();
    const agent = {
      systemPrompt: "System prompt",
      async runMessages(messages, callbacks) {
        callbacks.onToolCall({ id: "call_0", name: "bash", args: { command: "pwd" } });
        callbacks.onToolResult({ id: "call_0", name: "bash", result: "/tmp", isError: false });
        messages.push({ role: "assistant", content: "done" });
        return "done";
      },
    };

    await new AgentSession({ agent, store }).prompt("where am I?");

    expect(store.entries).toEqual([
      { type: "message", message: { role: "user", content: "where am I?" } },
      { type: "tool_call", toolCall: { id: "call_0", name: "bash", args: { command: "pwd" } } },
      { type: "tool_result", toolResult: { id: "call_0", name: "bash", result: "/tmp", isError: false } },
      { type: "message", message: { role: "assistant", content: "done" } },
    ]);
  });
});
