import { ModelStrategy } from "./base.js";
import { extractFunctionGemmaToolCalls } from "./parsing.js";

export class FunctionGemmaStrategy extends ModelStrategy {
  getTokenizerEncodeKwargs({ toolSchemas }) {
    return toolSchemas.length ? { tools: toolSchemas } : undefined;
  }

  parseReply(raw) {
    if (!raw || typeof raw.content !== "string") return raw;
    if (Array.isArray(raw.tool_calls) && raw.tool_calls.length > 0) return raw;

    const extracted = extractFunctionGemmaToolCalls(raw.content);
    if (!extracted) return raw;

    return {
      role: "assistant",
      content: extracted.cleaned,
      tool_calls: extracted.tool_calls,
    };
  }
}
