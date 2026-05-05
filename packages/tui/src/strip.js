/** Strip ANSI escape codes and measure / slice by visible width. */

const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/** Remove all ANSI escape sequences from a string. */
export function strip(str) {
  return str.replace(ANSI_RE, "");
}

/** Visible (printable) character width — ignores escape codes. */
export function visibleWidth(str) {
  return strip(str).length;
}

/**
 * Pad a string with ANSI codes to exactly `width` visible characters.
 * Appends trailing spaces; never truncates.
 */
export function padEnd(str, width) {
  const vis = visibleWidth(str);
  return vis >= width ? str : str + " ".repeat(width - vis);
}

/**
 * Truncate a string (with ANSI codes) to `width` visible characters,
 * appending `ellipsis` if truncated.
 */
export function truncate(str, width, ellipsis = "…") {
  const plain = strip(str);
  if (plain.length <= width) return str;
  return plain.slice(0, width - ellipsis.length) + ellipsis;
}
