import { ModelStrategy } from "./base.js";

export class GenericToolStrategy extends ModelStrategy {
  getTokenizerEncodeKwargs({ toolSchemas }) {
    return toolSchemas.length ? { tools: toolSchemas } : undefined;
  }

  parseReply(raw) {
    return raw;
  }
}
