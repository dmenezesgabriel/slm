import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRuntime } from "./tool-runtime.js";
import { Tool } from "./tool.js";

class RecordingTool extends Tool {
  name = "record";
  description = "Record a value.";
  schema = z.object({ value: z.string() });

  constructor(log) {
    super();
    this.log = log;
  }

  async execute({ value }) {
    this.log.push(value);
    return `recorded:${value}`;
  }
}

describe("ToolRuntime", () => {
  it("executes tool calls sequentially and returns tool result messages", async () => {
    const log = [];
    const events = [];
    const runtime = new ToolRuntime({
      tools: [new RecordingTool(log)],
      onToolCall: (event) => events.push(["call", event.name, event.args]),
      onToolResult: (event) => events.push(["result", event.name, event.result]),
    });

    const result = await runtime.execute([
      {
        id: "call_0",
        type: "function",
        function: { name: "record", arguments: JSON.stringify({ value: "a" }) },
      },
      {
        id: "call_1",
        type: "function",
        function: { name: "record", arguments: JSON.stringify({ value: "b" }) },
      },
    ]);

    expect(result.finalAnswer).toBeNull();
    expect(log).toEqual(["a", "b"]);
    expect(result.messages.map((m) => [m.role, m.tool_call_id, m.content])).toEqual([
      ["tool", "call_0", "recorded:a"],
      ["tool", "call_1", "recorded:b"],
    ]);
    expect(events).toEqual([
      ["call", "record", { value: "a" }],
      ["result", "record", "recorded:a"],
      ["call", "record", { value: "b" }],
      ["result", "record", "recorded:b"],
    ]);
  });

  it("wraps failed tool results in unambiguous model-visible observations", async () => {
    class FailingTool extends Tool {
      name = "failing";
      description = "Fails.";
      schema = z.object({});
      async execute() {
        return { content: "Exit 127", isError: true };
      }
    }

    const result = await new ToolRuntime({ tools: [new FailingTool()] }).execute([
      {
        id: "call_0",
        type: "function",
        function: { name: "failing", arguments: JSON.stringify({}) },
      },
    ]);

    expect(result.messages[0]).toMatchObject({
      role: "tool",
      tool_call_id: "call_0",
      content: "Tool \"failing\" failed:\nExit 127",
    });
  });

  it("recognizes final_answer as the terminal tool", async () => {
    const runtime = new ToolRuntime({ tools: [] });

    const result = await runtime.execute([
      {
        id: "call_final",
        type: "function",
        function: { name: "final_answer", arguments: JSON.stringify({ answer: "done" }) },
      },
    ]);

    expect(result.finalAnswer).toBe("done");
    expect(result.messages).toEqual([]);
  });
});
