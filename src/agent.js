/**
 * src/agent.js
 *
 * ReAct (Reason + Act) agent loop.
 *
 * The model is prompted to emit structured reasoning in the form:
 *
 *   Thought: <why I need this tool>
 *   Action: <tool_name>
 *   Action Input: <tool_input>
 *
 * When it has enough information it emits:
 *
 *   Thought: I now know the final answer.
 *   Final Answer: <answer>
 *
 * The loop parses each response, dispatches the tool, appends the observation
 * to the conversation, and calls the model again — up to maxIterations.
 */

import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";

// ── Prompt helpers ─────────────────────────────────────────────────────────────

function buildSystemPrompt(tools) {
  const toolDescriptions = tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");

  const toolNames = tools.map((t) => t.name).join(", ");

  return `You are a helpful AI assistant that can use tools to answer questions.

You have access to the following tools:
${toolDescriptions}

To use a tool, respond EXACTLY in this format (one action per response):

Thought: <your reasoning about what to do next>
Action: <one of: ${toolNames}>
Action Input: <the input to the tool>

When you have the final answer, respond EXACTLY in this format:

Thought: I now have enough information to answer the question.
Final Answer: <your complete answer to the user>

Rules:
- Always start with a Thought.
- Use exactly one Action per response, or give a Final Answer — never both.
- Do not invent tool results; wait for the Observation.
- If a tool errors, try a different approach or admit you cannot answer.`;
}

function buildObservationMessage(observation) {
  return `Observation: ${observation}\n\nContinue reasoning.`;
}

// ── Parser ─────────────────────────────────────────────────────────────────────

/**
 * Parses the model's raw text.
 * Returns { type: "action", tool, input } or { type: "final", answer } or { type: "unknown", raw }.
 */
function parseResponse(text) {
  // Final Answer
  const finalMatch = text.match(/Final Answer:\s*([\s\S]+)/i);
  if (finalMatch) {
    return { type: "final", answer: finalMatch[1].trim() };
  }

  // Action + Action Input
  const actionMatch = text.match(/Action:\s*(.+)/i);
  const inputMatch = text.match(/Action Input:\s*([\s\S]+?)(?:\nObservation:|$)/i);

  if (actionMatch) {
    return {
      type: "action",
      tool: actionMatch[1].trim(),
      input: inputMatch ? inputMatch[1].trim() : "",
    };
  }

  return { type: "unknown", raw: text };
}

// ── Agent class ────────────────────────────────────────────────────────────────

export class ReactAgent {
  /**
   * @param {import('./llm.js').TransformersJSChatModel} llm
   * @param {Array<{name:string, description:string, run: (s:string) => Promise<string>}>} tools
   * @param {{ maxIterations?: number, verbose?: boolean }} opts
   */
  constructor(llm, tools, opts = {}) {
    this.llm = llm;
    this.tools = tools;
    this.toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));
    this.maxIterations = opts.maxIterations ?? 8;
    this.verbose = opts.verbose ?? true;
  }

  _log(label, text) {
    if (!this.verbose) return;
    const divider = "─".repeat(60);
    console.log(`\n${divider}`);
    console.log(`[${label}]`);
    console.log(text);
  }

  async run(userQuery) {
    const systemPrompt = buildSystemPrompt(this.tools);
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userQuery),
    ];

    this._log("User", userQuery);

    for (let i = 0; i < this.maxIterations; i++) {
      const response = await this.llm._generate(messages);
      const rawText = response.generations[0].text;

      this._log(`Model (step ${i + 1})`, rawText);

      const parsed = parseResponse(rawText);

      if (parsed.type === "final") {
        this._log("Final Answer", parsed.answer);
        return parsed.answer;
      }

      if (parsed.type === "action") {
        const tool = this.toolMap[parsed.tool];
        if (!tool) {
          const obs = `Error: tool "${parsed.tool}" not found. Available: ${Object.keys(this.toolMap).join(", ")}`;
          this._log("Observation", obs);
          messages.push(new AIMessage(rawText));
          messages.push(new HumanMessage(buildObservationMessage(obs)));
          continue;
        }

        this._log("Tool Call", `${tool.name}("${parsed.input}")`);
        const observation = await tool.run(parsed.input);
        this._log("Observation", observation);

        messages.push(new AIMessage(rawText));
        messages.push(new HumanMessage(buildObservationMessage(observation)));
        continue;
      }

      // Unknown response — treat the whole thing as a final answer
      this._log("Final Answer (fallback)", rawText);
      return rawText;
    }

    return "I reached the maximum number of reasoning steps without a final answer. Please try rephrasing your question.";
  }
}
