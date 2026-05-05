const DESTRUCTIVE_PATTERNS = [
  /(^|[;&|]\s*)rm\s+(-[^\n]*[rf]|[^\n]*\s-rf|[^\n]*\s-fr)\b/,
  /(^|[;&|]\s*)sudo\b/,
  /(^|[;&|]\s*)git\s+reset\s+--hard\b/,
  /(^|[;&|]\s*)git\s+clean\b/,
  /(^|[;&|]\s*)mkfs\b/,
  /(^|[;&|]\s*)dd\b/,
  />\s*\/dev\/sd[a-z]/,
];

export function isDestructiveCommand(command) {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
}
