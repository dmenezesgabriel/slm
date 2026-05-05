import { describe, expect, it } from "vitest";
import { AgentSession } from "./session.js";

describe("AgentSession tool events", () => {
  it("emits tool call and tool result events from the agent runtime", async () => {
    const agent = {
      systemPrompt: "System prompt",
      async runMessages(messages, callbacks) {
        callbacks.onToolCall?.({ id: "call_0", name: "write", args: { path: "hello.py" } });
        callbacks.onToolResult?.({ id: "call_0", name: "write", result: "Written hello.py" });
        messages.push({ role: "assistant", content: "Created hello.py" });
        return "Created hello.py";
      },
    };
    const session = new AgentSession({ agent });
    const events = [];
    session.subscribe((event) => events.push(event));

    await session.prompt("create hello.py");

    expect(events.map((e) => e.type)).toEqual([
      "prompt_start",
      "message",
      "tool_call",
      "tool_result",
      "message",
      "assistant_response",
      "prompt_end",
    ]);
    expect(events[2]).toMatchObject({ id: "call_0", name: "write", args: { path: "hello.py" } });
    expect(events[3]).toMatchObject({ id: "call_0", name: "write", result: "Written hello.py" });
  });
});
