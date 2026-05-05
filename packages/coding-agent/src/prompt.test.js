import { describe, expect, it } from "vitest";
import { getCodingAgentSystemPrompt } from "./prompt.js";

describe("coding agent system prompt", () => {
  it("defines coding-agent behavior without duplicating runtime tool schemas", () => {
    const prompt = getCodingAgentSystemPrompt();

    expect(prompt).toContain("SLMS Coding Agent");
    expect(prompt).toMatch(/tool schemas are provided separately/i);
    expect(prompt).toMatch(/inspect, create, modify, or verify project files/i);
    expect(prompt).toMatch(/call the appropriate tool/i);
    expect(prompt).toMatch(/Do not merely print/i);
    expect(prompt).toMatch(/If a tool result says it failed/i);
    expect(prompt).toMatch(/do not claim success/i);
    expect(prompt).not.toMatch(/call the write tool/i);
  });
});
