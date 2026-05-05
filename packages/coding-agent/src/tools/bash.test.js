import { describe, expect, it } from "vitest";
import { BashTool } from "./bash.js";

describe("BashTool", () => {
  it("marks non-zero exits as structured errors", async () => {
    const result = await new BashTool().runWithResult({ command: "command-not-found-for-slms-test" });

    expect(result.isError).toBe(true);
    expect(result.content).toContain("command-not-found-for-slms-test");
    expect(result.content).toContain("Exit 127");
  });
});
