import { makeToolCall } from "../tool-call.js";

export class HeuristicToolRouter {
  /**
   * Lightweight deterministic fallback for very small models that sometimes see
   * tool declarations but still answer from text. It only routes high-confidence
   * intents and can be replaced via Agent({ toolRouter }).
   *
   * @param {{ query: string, tools: import('../tool.js').Tool[], reply?: object }} input
   * @returns {object[]} OpenAI-style tool calls
   */
  plan({ query, tools }) {
    const available = new Set(tools.map((tool) => tool.name));
    const text = query.trim();
    const lower = text.toLowerCase();

    if (available.has("get_date_time") && /\b(now|current|today|right now)\b/.test(lower) && /\b(time|date|day)\b/.test(lower)) {
      return [makeToolCall("get_date_time", {}, 0)];
    }

    if (available.has("get_weather")) {
      const city = extractWeatherCity(text);
      if (city) return [makeToolCall("get_weather", { city }, 0)];
    }

    if (available.has("calculator")) {
      const expression = extractMathExpression(text);
      if (expression) return [makeToolCall("calculator", { expression }, 0)];
    }

    if (available.has("wikipedia")) {
      const topic = extractWikipediaTopic(text);
      if (topic) return [makeToolCall("wikipedia", { topic }, 0)];
    }

    return [];
  }

  /**
   * Heuristic routes are already high-confidence and the tool result is usually
   * the best concise answer. Returning it directly avoids tiny models drifting
   * while rephrasing observations.
   */
  shouldReturnDirect({ observations }) {
    return Array.isArray(observations) && observations.length > 0;
  }
}

function extractWeatherCity(text) {
  const match = text.match(/\bweather\b[\s\S]*?\b(?:in|for|at)\s+([^?.!,;]+(?:,\s*[^?.!,;]+)?)/i)
    ?? text.match(/\b(?:in|for|at)\s+([^?.!,;]+(?:,\s*[^?.!,;]+)?)\s+[\s\S]*?\bweather\b/i);

  return cleanupEntity(match?.[1]);
}

function extractWikipediaTopic(text) {
  const lower = text.toLowerCase();
  if (!/\b(wikipedia|summary|summarize|who is|what is|tell me about)\b/.test(lower)) return null;
  if (/\b(weather|time|date|calculate|compute)\b/.test(lower)) return null;

  const match = text.match(/(?:summary of|summarize|tell me about|who is|what is)\s+(.+?)[?.!]?$/i)
    ?? text.match(/wikipedia\s+(?:for|about|on)?\s*(.+?)[?.!]?$/i);

  return cleanupEntity(match?.[1]);
}

function extractMathExpression(text) {
  const squareResult = text.match(/\b(?:calculate|compute|evaluate)\s+([\s\S]+?),?\s*then\s+square\s+(?:that|the)\s+result/i);
  if (squareResult) {
    const base = cleanupExpression(squareResult[1]);
    if (base && looksLikeMath(base)) return `(${base}) ** 2`;
  }

  const explicit = text.match(/\bexpression\s+([^.;?]+)/i);
  if (explicit) return cleanupExpression(explicit[1]);

  const calculate = text.match(/\b(?:calculate|compute|evaluate)\s+([^.;?]+)/i);
  if (calculate) {
    const expression = cleanupExpression(calculate[1]);
    if (looksLikeMath(expression)) return expression;
  }

  const symbolic = text.match(/([-+*/^().\d\s]+(?:\*\*|[-+*/^])[-+*/^().\d\s]+)/);
  if (symbolic) return cleanupExpression(symbolic[1]);

  const sqrtThenAdd = text.match(/square root of\s+(\d+(?:\.\d+)?)\s*,?\s*then add\s+(\d+(?:\.\d+)?)/i);
  if (sqrtThenAdd) return `sqrt(${sqrtThenAdd[1]}) + ${sqrtThenAdd[2]}`;

  return null;
}

function looksLikeMath(expression) {
  return /\d/.test(expression) && /(?:\*\*|[-+*/^()]|sqrt|pow|sin|cos|tan|log)/i.test(expression);
}

function cleanupExpression(value) {
  return value
    ?.replace(/\bthen\b[\s\S]*$/i, "")
    .replace(/[^\w\s+\-*/().%^,]/g, "")
    .trim() || null;
}

function cleanupEntity(value) {
  return value
    ?.replace(/\b(right now|now|today|please|using tools?|then answer|current)\b/gi, "")
    .replace(/["'`]/g, "")
    .trim()
    .replace(/[.?!,;:]$/g, "")
    .trim() || null;
}
