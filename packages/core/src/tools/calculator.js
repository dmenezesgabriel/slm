import { z } from "zod";
import { Tool } from "../tool.js";

export class CalculatorTool extends Tool {
  name        = "calculator";
  description = "Evaluates a mathematical expression and returns the numeric result.";
  schema      = z.object({
    expression: z.string().describe(
      "A valid math expression, e.g. '2 + 2', '(17 * 3) / 4', 'sqrt(144)', '2 ** 10'"
    ),
  });

  async execute({ expression }) {
    const scope = {
      sqrt: Math.sqrt, pow: Math.pow, abs: Math.abs,
      round: Math.round, floor: Math.floor, ceil: Math.ceil,
      log: Math.log, log2: Math.log2, log10: Math.log10,
      sin: Math.sin, cos: Math.cos, tan: Math.tan,
      PI: Math.PI, E: Math.E,
    };
    const sanitised = expression.replace(/\^/g, "**");
    const fn = new Function(...Object.keys(scope), `"use strict"; return (${sanitised});`);
    const result = fn(...Object.values(scope));
    return String(result);
  }
}
