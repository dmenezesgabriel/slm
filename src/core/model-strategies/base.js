export class ModelStrategy {
  /**
   * @param {{ toolSchemas: object[], enableThinking: boolean }} _input
   * @returns {object | undefined} kwargs forwarded to tokenizer.apply_chat_template()
   */
  getTokenizerEncodeKwargs(_input) {
    return undefined;
  }

  /**
   * @param {{ maxNewTokens: number, enableThinking: boolean, thinkingBudget: number }} input
   * @returns {number}
   */
  getEffectiveMaxNewTokens({ maxNewTokens }) {
    return maxNewTokens;
  }

  /**
   * @param {{ role: string, content: string, tool_calls?: object[] } | undefined} raw
   * @returns {{ role: string, content: string, tool_calls?: object[] } | undefined}
   */
  parseReply(raw) {
    return raw;
  }
}
