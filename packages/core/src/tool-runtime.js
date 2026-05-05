import { FinalAnswerTool } from "./tools/final-answer.js";

const FINAL_ANSWER_TOOL_NAME = "final_answer";

function truncate(str, maxChars) {
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + `… [truncated ${str.length - maxChars} chars]`;
}

function formatObservation(name, result) {
  return result.isError
    ? `Tool "${name}" failed:\n${result.content}`
    : result.content;
}

function toolResultMessage(toolCallId, content, maxChars) {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: truncate(String(content), maxChars),
  };
}

function parseArguments(rawArgs) {
  if (typeof rawArgs !== "string") return rawArgs ?? {};
  return JSON.parse(rawArgs);
}

export class ToolRuntime {
  constructor({ tools = [], maxResultChars = 1200, onToolCall, onToolResult } = {}) {
    const allTools = tools.some((tool) => tool.name === FINAL_ANSWER_TOOL_NAME)
      ? tools
      : [...tools, new FinalAnswerTool()];

    this.tools = allTools;
    this._toolMap = Object.fromEntries(allTools.map((tool) => [tool.name, tool]));
    this.maxResultChars = maxResultChars;
    this.onToolCall = onToolCall ?? null;
    this.onToolResult = onToolResult ?? null;
  }

  async execute(toolCalls = []) {
    const messages = [];

    for (const call of toolCalls) {
      const id = call.id ?? call.function?.name ?? "tool_call";
      const name = call.function?.name;

      let args;
      try {
        args = parseArguments(call.function?.arguments);
      } catch (error) {
        const result = `Bad tool-call JSON for "${name}": ${error.message}`;
        this.onToolResult?.({ id, name, result, isError: true });
        messages.push(toolResultMessage(id, result, this.maxResultChars));
        continue;
      }

      this.onToolCall?.({ id, name, args });

      const tool = this._toolMap[name];
      if (!tool) {
        const result = `Unknown tool: "${name}". Available: ${Object.keys(this._toolMap).join(", ")}`;
        this.onToolResult?.({ id, name, result, isError: true });
        messages.push(toolResultMessage(id, result, this.maxResultChars));
        continue;
      }

      const result = await tool.runWithResult(args);
      const isFinalAnswer = name === FINAL_ANSWER_TOOL_NAME;
      this.onToolResult?.({ id, name, result: result.content, isError: result.isError, isFinalAnswer });

      if (isFinalAnswer) {
        return { finalAnswer: result.content, messages };
      }

      messages.push(toolResultMessage(id, formatObservation(name, result), this.maxResultChars));
    }

    return { finalAnswer: null, messages };
  }
}

export { FINAL_ANSWER_TOOL_NAME };
