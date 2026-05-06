import { FunctionGemmaStrategy } from "./function-gemma.js";
import { GenericToolStrategy } from "./generic.js";
import { QwenStrategy } from "./qwen.js";

const registry = [
  {
    id: "function-gemma",
    matches: (modelId) => /functiongemma|function-gemma/i.test(modelId),
    create: () => new FunctionGemmaStrategy(),
  },
  {
    id: "qwen",
    matches: (modelId) => /qwen/i.test(modelId),
    create: () => new QwenStrategy(),
  },
];

/**
 * Register a model strategy without changing Agent (Open/Closed Principle).
 * @param {{ id: string, matches: (modelId: string) => boolean, create: () => object }} entry
 */
export function registerModelStrategy(entry) {
  registry.unshift(entry);
}

export function createModelStrategy(modelId = "") {
  const entry = registry.find((candidate) => candidate.matches(modelId));
  return entry ? entry.create() : new GenericToolStrategy();
}
