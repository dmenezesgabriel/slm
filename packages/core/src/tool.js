/**
 * src/core/tool.js
 *
 * Tool base class.
 *
 * Every tool:
 *   - has a name and description (used in the LLM system prompt)
 *   - declares its input shape with a Zod schema
 *   - exposes a toOpenAISchema() that produces the JSON-Schema block
 *     the transformers.js pipeline `tools` array expects
 *   - implements execute(validatedInput) → Promise<string | ToolResult>
 *
 * Usage:
 *   class MyTool extends Tool {
 *     name        = "my_tool";
 *     description = "Does X. Args: y (string).";
 *     schema      = z.object({ y: z.string().describe("The Y value") });
 *
 *     async execute({ y }) {
 *       return `result for ${y}`;
 *     }
 *   }
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

function normalizeToolResult(value) {
  if (value && typeof value === "object" && "content" in value) {
    return {
      content: String(value.content),
      isError: Boolean(value.isError),
    };
  }

  return {
    content: String(value),
    isError: false,
  };
}

export class Tool {
  /** @type {string} — tool name as the model will call it */
  name = "";

  /** @type {string} — one-line description for the model */
  description = "";

  /** @type {import("zod").ZodObject<any>} — input schema */
  schema = z.object({});

  /**
   * Produce the OpenAI-compatible function schema block that
   * transformers.js passes to the model's chat template.
   *
   * @returns {{ type: "function", function: object }}
   */
  toOpenAISchema() {
    const jsonSchema = zodToJsonSchema(this.schema, {
      name: this.name,
      $refStrategy: "none",   // inline all refs — models can't follow $ref
    });

    // zodToJsonSchema wraps in { $schema, title, definitions, ... }
    // We want only the inner properties/required block.
    const { properties, required } = jsonSchema.definitions?.[this.name]
      ?? jsonSchema;

    return {
      type: "function",
      function: {
        name:        this.name,
        description: this.description,
        parameters: {
          type: "object",
          properties: properties ?? {},
          required:   required   ?? [],
        },
      },
    };
  }

  /**
   * Run the tool.
   * Validates args with Zod before calling execute() so the model can't
   * pass malformed input.
   *
   * @param {unknown} rawArgs  — parsed JSON from the model's tool_call
   * @returns {Promise<string>}
   */
  async run(rawArgs) {
    const result = await this.runWithResult(rawArgs);
    return result.content;
  }

  /**
   * Run the tool and return structured result metadata for agent runtimes.
   * @param {unknown} rawArgs — parsed JSON from the model's tool_call
   * @returns {Promise<{ content: string, isError: boolean }>}
   */
  async runWithResult(rawArgs) {
    const parsed = this.schema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        content: `Tool input validation error: ${parsed.error.message}`,
        isError: true,
      };
    }

    try {
      return normalizeToolResult(await this.execute(parsed.data));
    } catch (err) {
      return {
        content: `Tool execution error: ${err.message}`,
        isError: true,
      };
    }
  }

  /**
   * Override this in subclasses.
   * @param {object} _input — validated and typed input
   * @returns {Promise<string | { content: string, isError?: boolean }>}
   */
  async execute(_input) {
    throw new Error(`Tool "${this.name}" has no execute() implementation.`);
  }
}
