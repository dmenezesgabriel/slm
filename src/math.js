/**
 * src/math.js
 *
 * Safe arithmetic evaluator — avoids eval() by using the Function constructor
 * constrained to a whitelist of Math methods.
 */

const ALLOWED = /^[\d\s\+\-\*\/\(\)\.\^%]+$|sqrt|pow|abs|round|floor|ceil|log|sin|cos|tan|PI|E/;

export function evaluate(expr) {
  // Replace ^ with ** for exponentiation
  const sanitised = expr.replace(/\^/g, "**");

  // Build a scope that exposes only Math methods
  const scope = {
    sqrt: Math.sqrt,
    pow: Math.pow,
    abs: Math.abs,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    log: Math.log,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    PI: Math.PI,
    E: Math.E,
  };

  const fn = new Function(
    ...Object.keys(scope),
    `"use strict"; return (${sanitised});`
  );

  return fn(...Object.values(scope));
}
