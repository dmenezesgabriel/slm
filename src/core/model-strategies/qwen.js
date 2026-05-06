import { ModelStrategy } from "./base.js";
import { stripThinkBlocks } from "./parsing.js";

export class QwenStrategy extends ModelStrategy {
  getTokenizerEncodeKwargs({ toolSchemas, enableThinking }) {
    const kwargs = {};

    if (toolSchemas.length) {
      // Selects Qwen's `tool_use` chat-template variant.
      kwargs.tools = toolSchemas;
    }

    if (!enableThinking) {
      // Qwen templates understand this kwarg and pre-fill an empty think block.
      kwargs.enable_thinking = false;
    }

    return Object.keys(kwargs).length ? kwargs : undefined;
  }

  getEffectiveMaxNewTokens({ maxNewTokens, enableThinking, thinkingBudget }) {
    return enableThinking ? maxNewTokens + thinkingBudget : maxNewTokens;
  }

  parseReply(raw) {
    if (!raw || typeof raw.content !== "string") return raw;
    if (Array.isArray(raw.tool_calls) && raw.tool_calls.length > 0) return raw;

    const content = raw.content;
    const toolCallMatches = [...content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)];

    if (toolCallMatches.length === 0) {
      return { ...raw, content: stripThinkBlocks(content) };
    }

    const tool_calls = [];
    for (const match of toolCallMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        tool_calls.push({
          id: `call_${tool_calls.length}`,
          type: "function",
          function: {
            name: parsed.name,
            arguments: typeof parsed.arguments === "string"
              ? parsed.arguments
              : JSON.stringify(parsed.arguments ?? {}),
          },
        });
      } catch (_err) {
        // Ignore malformed/truncated blocks; fallback below handles all-failed.
      }
    }

    if (tool_calls.length === 0) {
      const cleaned = stripThinkBlocks(content);
      return { ...raw, content: cleaned || content.trim() };
    }

    return {
      role: "assistant",
      content: content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trimEnd(),
      tool_calls,
    };
  }
}
