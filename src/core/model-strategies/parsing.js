import { makeToolCall } from "../tool-call.js";

const TOOL_NAME_RE = "[a-zA-Z0-9_.$-]+";

export function stripThinkBlocks(content) {
  return content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

export function coerceScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;

  const n = Number(value);
  if (!Number.isNaN(n) && value !== "") return n;

  return value;
}

/**
 * Parse FunctionGemma's compact argument format:
 *   expression:<escape>1+1<escape>,city:<escape>Tokyo<escape>
 * Also tolerates degraded decoded values where special tokens were stripped:
 *   expression:17*23$$|$$$$...
 */
export function parseFunctionGemmaArgs(argsText = "") {
  const args = {};
  const keyMatches = [...argsText.matchAll(/([a-zA-Z0-9_.$-]+)\s*:/g)];

  for (let i = 0; i < keyMatches.length; i++) {
    const key = keyMatches[i][1];
    const valueStart = keyMatches[i].index + keyMatches[i][0].length;
    const valueEnd = i + 1 < keyMatches.length ? keyMatches[i + 1].index : argsText.length;
    let rawValue = argsText.slice(valueStart, valueEnd).replace(/^\s*,\s*/, "").replace(/,\s*$/, "").trim();

    if (rawValue.startsWith("<escape>")) {
      const end = rawValue.indexOf("<escape>", "<escape>".length);
      rawValue = end >= 0
        ? rawValue.slice("<escape>".length, end)
        : rawValue.slice("<escape>".length);
    } else {
      rawValue = cleanUnescapedGemmaValue(rawValue);
    }

    args[key] = coerceScalar(rawValue.trim());
  }

  return args;
}

function cleanUnescapedGemmaValue(value) {
  return value
    // Drop anything after known function-control remnants/noise.
    .replace(/<end_function_call>[\s\S]*$/g, "")
    .replace(/<start_function_response>[\s\S]*$/g, "")
    .replace(/\$\$\|[\s\S]*$/g, "")
    // FunctionGemma q4 sometimes pads malformed calls with '$'/'|'.
    .replace(/[$|]+$/g, "")
    .replace(/^['\"]|['\"]$/g, "")
    .trim();
}

export function extractFunctionGemmaToolCalls(content) {
  const calls = [];

  // Complete calls, before special tokens are stripped:
  // <start_function_call>call:calculator{expression:<escape>1+1<escape>}<end_function_call>
  const completeRe = new RegExp(
    `(?:<start_function_call>\\s*)?call:(${TOOL_NAME_RE})\\s*\\{([\\s\\S]*?)\\}\\s*(?:<end_function_call>)?`,
    "g",
  );

  let consumed = [];
  for (const match of content.matchAll(completeRe)) {
    calls.push(makeToolCall(match[1], parseFunctionGemmaArgs(match[2]), calls.length));
    consumed.push([match.index, match.index + match[0].length]);
  }

  // Degraded/partial calls after transformers.js stripped special tokens or the
  // model hit max_new_tokens before closing the brace:
  // call:calculator{expression:17*23$$|$$$$...
  const partialRe = new RegExp(`(?:^|\\s)call:(${TOOL_NAME_RE})\\s*\\{`, "g");
  for (const match of content.matchAll(partialRe)) {
    const start = match.index + match[0].length;
    if (consumed.some(([from, to]) => match.index < to && start > from)) continue;

    const rest = content.slice(start);
    const nextCall = rest.search(new RegExp(`(?:^|\\s)call:${TOOL_NAME_RE}\\s*\\{`));
    const body = nextCall >= 0 ? rest.slice(0, nextCall) : rest;
    if (!body.trim()) continue;

    calls.push(makeToolCall(match[1], parseFunctionGemmaArgs(body), calls.length));
    consumed.push([match.index, content.length]);
  }

  if (calls.length === 0) return null;

  const cleaned = removeRanges(content, consumed)
    .replace(/<start_function_response>/g, "")
    .trim();

  return { cleaned, tool_calls: calls };
}

function removeRanges(content, ranges) {
  if (ranges.length === 0) return content;
  const sorted = ranges.sort((a, b) => a[0] - b[0]);
  let out = "";
  let cursor = 0;
  for (const [from, to] of sorted) {
    out += content.slice(cursor, from);
    cursor = Math.max(cursor, to);
  }
  out += content.slice(cursor);
  return out;
}
