import { describe, expect, it } from "vitest";
import { BashTool } from "./bash.js";
import { isDestructiveCommand } from "./destructive-command.js";

describe("destructive command policy", () => {
  it("detects destructive shell commands conservatively", () => {
    expect(isDestructiveCommand("rm -rf dist")).toBe(true);
    expect(isDestructiveCommand("sudo apt install python3")).toBe(true);
    expect(isDestructiveCommand("git reset --hard HEAD")).toBe(true);
    expect(isDestructiveCommand("python3 hello.py")).toBe(false);
    expect(isDestructiveCommand("ls -la")).toBe(false);
  });

  it("requires confirmation before running destructive commands", async () => {
    const calls = [];
    const tool = new BashTool({
      confirmDestructive: async ({ command }) => {
        calls.push(command);
        return false;
      },
    });

    const result = await tool.runWithResult({ command: "rm -rf dist" });

    expect(calls).toEqual(["rm -rf dist"]);
    expect(result).toMatchObject({ isError: true, content: expect.stringContaining("not confirmed") });
  });

  it("does not request confirmation for non-destructive commands", async () => {
    const calls = [];
    const result = await new BashTool({
      confirmDestructive: async ({ command }) => {
        calls.push(command);
        return false;
      },
    }).runWithResult({ command: "printf hello" });

    expect(calls).toEqual([]);
    expect(result).toEqual({ content: "hello", isError: false });
  });
});
