import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Agent, Tool } from "./index.js";

class EchoTool extends Tool {
  name = "echo";
  description = "Echo text.";
  schema = z.object({ text: z.string().describe("Text to echo") });
  async execute({ text }) { return text; }
}

describe("Agent tool schema injection", () => {
  it("passes registered tool schemas to the Transformers.js chat template path", async () => {
    const agent = new Agent({ tools: [new EchoTool()], stream: false, verbose: false });
    let generateOptions;
    agent._pipe = async (_messages, options) => {
      generateOptions = options;
      return [{ generated_text: [{ role: "assistant", content: "done" }] }];
    };

    await agent.runMessages([
      { role: "system", content: agent.systemPrompt },
      { role: "user", content: "echo hello" },
    ]);

    const toolSchemas = generateOptions.tokenizer_encode_kwargs.tools;
    expect(toolSchemas.map((schema) => schema.function.name)).toEqual(["echo", "final_answer"]);
    expect(toolSchemas[0]).toMatchObject({
      type: "function",
      function: {
        name: "echo",
        description: "Echo text.",
        parameters: {
          type: "object",
          required: ["text"],
        },
      },
    });
  });
});
