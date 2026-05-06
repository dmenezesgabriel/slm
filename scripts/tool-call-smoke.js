#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { Agent } from "../src/core/agent.js";
import {
  CalculatorTool,
  DateTimeTool,
  WikipediaTool,
  WeatherTool,
} from "../src/tools/index.js";

const PYTHON_EXPR_EVAL = String.raw`
import ast, json, math, sys

expr = sys.argv[1].replace('^', '**')
allowed_names = {
    'sqrt': math.sqrt, 'pow': pow, 'abs': abs,
    'round': round, 'floor': math.floor, 'ceil': math.ceil,
    'log': math.log, 'log2': math.log2, 'log10': math.log10,
    'sin': math.sin, 'cos': math.cos, 'tan': math.tan,
    'PI': math.pi, 'E': math.e, 'pi': math.pi, 'e': math.e,
}
allowed_nodes = (
    ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod, ast.FloorDiv,
    ast.UAdd, ast.USub, ast.Call, ast.Name, ast.Load,
)

tree = ast.parse(expr, mode='eval')
for node in ast.walk(tree):
    if not isinstance(node, allowed_nodes):
        raise ValueError(f'Unsupported expression node: {type(node).__name__}')
    if isinstance(node, ast.Name) and node.id not in allowed_names:
        raise ValueError(f'Unsupported name: {node.id}')
    if isinstance(node, ast.Call) and not isinstance(node.func, ast.Name):
        raise ValueError('Only direct function calls are allowed')

value = eval(compile(tree, '<expr>', 'eval'), {'__builtins__': {}}, allowed_names)
print(json.dumps({'value': value, 'text': format(value, '.17g')}))
`;

const DEFAULT_CASES = [
  {
    name: "multi-step arithmetic with natural-language operation",
    query: "What is (17 * 23 - 144) squared?",
    expectedTool: "calculator",
    expectedExpression: "(17 * 23 - 144) ** 2",
  },
  {
    name: "mixed functions and exponentiation",
    query: "Evaluate sqrt(9801) + 7 ** 3.",
    expectedTool: "calculator",
    expectedExpression: "sqrt(9801) + 7 ** 3",
  },
  {
    name: "large parenthesized expression",
    query: "What is ((9137 * 4621) - 847293) / 17?",
    expectedTool: "calculator",
    expectedExpression: "((9137 * 4621) - 847293) / 17",
  },
];

function casesFromCli() {
  const query = process.argv.slice(2).filter((arg) => arg !== "--").join(" ");
  if (!query) return DEFAULT_CASES;

  return [{
    name: "custom prompt",
    query,
    expectedTool: process.env.EXPECTED_TOOL ?? "calculator",
    expectedExpression: process.env.EXPECTED_EXPRESSION,
  }];
}

function assertNoExplicitToolInstruction(query) {
  if (/\b(use|call)\s+(a\s+|the\s+)?(tool|function)\b/i.test(query)) {
    throw new Error(`Smoke prompt explicitly instructs tool use: ${JSON.stringify(query)}`);
  }
}

function pythonEval(expression) {
  if (!expression) throw new Error("Missing expected expression for Python oracle");
  return JSON.parse(execFileSync("python3", ["-c", PYTHON_EXPR_EVAL, expression], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }));
}

function assertClose(actual, expected, label) {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  const tolerance = Math.max(1e-9, Math.abs(expectedNumber) * 1e-12);

  if (!Number.isFinite(actualNumber) || Math.abs(actualNumber - expectedNumber) > tolerance) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function makeAgent() {
  return new Agent({
    model:           process.env.MODEL          ?? "onnx-community/Qwen3-0.6B-ONNX",
    dtype:           process.env.DTYPE          ?? "q4",
    device:          process.env.DEVICE         ?? "cpu",
    cacheDir:        process.env.CACHE_DIR      ?? "./.cache",
    threads:         Number(process.env.THREADS ?? 2),
    maxSteps:        Number(process.env.MAX_STEPS ?? 6),
    maxNewTokens:    Number(process.env.MAX_NEW_TOKENS ?? 256),
    enableThinking:  process.env.ENABLE_THINKING === "true",
    thinkingBudget:  Number(process.env.THINKING_BUDGET ?? 512),
    verbose:         process.env.VERBOSE === "true",
    stream:          false,
    tools: [
      new CalculatorTool(),
      new DateTimeTool(),
      new WikipediaTool(),
      new WeatherTool(),
    ],
  });
}

const agent = makeAgent();

try {
  for (const testCase of casesFromCli()) {
    assertNoExplicitToolInstruction(testCase.query);

    const expected = pythonEval(testCase.expectedExpression);
    const { answer, trace } = await agent.runWithTrace(testCase.query);
    const calledTools = trace.toolCalls
      .map(({ call }) => call.function?.name)
      .filter(Boolean);
    const matchingObservation = trace.toolResults.find(
      (obs) => obs.name === testCase.expectedTool && obs.ok
    );

    if (!trace.toolCalled) {
      throw new Error(`[${testCase.name}] expected a tool call, but trace.toolCalled is false`);
    }

    if (!calledTools.includes(testCase.expectedTool)) {
      throw new Error(
        `[${testCase.name}] expected model to call "${testCase.expectedTool}", ` +
        `but saw: ${calledTools.length ? calledTools.join(", ") : "no tool calls"}`
      );
    }

    if (!matchingObservation) {
      throw new Error(
        `[${testCase.name}] expected successful ${testCase.expectedTool} observation, got: ` +
        `${trace.toolResults.map((obs) => `${obs.name}=${obs.result}`).join("; ")}`
      );
    }

    const modelExpression = matchingObservation.args?.expression;
    const modelExpressionValue = pythonEval(modelExpression);
    assertClose(modelExpressionValue.value, matchingObservation.result, `[${testCase.name}] Python check for model tool expression`);
    assertClose(matchingObservation.result, expected.value, `[${testCase.name}] tool observation vs Python oracle`);

    if (!answer.includes(expected.text) && !answer.includes(String(matchingObservation.result))) {
      throw new Error(
        `[${testCase.name}] final answer does not include expected result ${expected.text}; ` +
        `got: ${JSON.stringify(answer)}`
      );
    }

    console.log(`✓ ${testCase.name}`);
    console.log(`  query: ${testCase.query}`);
    console.log(`  trace.toolCalled: ${trace.toolCalled}`);
    console.log(`  tool calls: ${calledTools.join(", ")}`);
    console.log(`  model expression: ${modelExpression}`);
    console.log(`  python oracle: ${expected.text}`);
    console.log(`  observation: ${matchingObservation.result}`);
    console.log(`  answer: ${answer}`);
  }

  console.log("\n✓ native tool-calling smoke suite passed");
} catch (err) {
  console.error("✗ native tool-calling smoke suite failed");
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
}
