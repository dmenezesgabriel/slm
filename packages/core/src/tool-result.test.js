import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Tool } from "./tool.js";

class ThrowingTool extends Tool {
  name = "throwing";
  schema = z.object({ value: z.string() });
  async execute() {
    throw new Error("failed hard");
  }
}

class StructuredTool extends Tool {
  name = "structured";
  schema = z.object({});
  async execute() {
    return { content: "nope", isError: true };
  }
}

describe("Tool structured results", () => {
  it("marks validation failures and thrown executions as errors", async () => {
    const tool = new ThrowingTool();

    await expect(tool.runWithResult({ value: 123 })).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("Tool input validation error"),
    });

    await expect(tool.runWithResult({ value: "ok" })).resolves.toEqual({
      content: "Tool execution error: failed hard",
      isError: true,
    });
  });

  it("allows tools to return structured error results", async () => {
    await expect(new StructuredTool().runWithResult({})).resolves.toEqual({
      content: "nope",
      isError: true,
    });
  });

  it("keeps run() backwards-compatible by returning only content", async () => {
    await expect(new StructuredTool().run({})).resolves.toBe("nope");
  });
});
