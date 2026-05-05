import { strip } from "./strip.js";

/**
 * Word-wrap `text` to `width` visible columns.
 * Preserves explicit newlines. Returns an array of lines.
 */
export function wrap(text, width) {
  if (!text) return [""];
  const result = [];

  for (const paragraph of String(text).split("\n")) {
    if (paragraph.trim() === "") { result.push(""); continue; }

    const words = paragraph.split(" ");
    let line = "";

    for (const word of words) {
      const wordLen = strip(word).length;
      const lineLen = strip(line).length;

      if (line === "") {
        line = word;
      } else if (lineLen + 1 + wordLen <= width) {
        line += " " + word;
      } else {
        if (line) result.push(line);
        line = word;
      }

      // Hard-break words longer than width
      while (strip(line).length > width) {
        result.push(strip(line).slice(0, width));
        line = strip(line).slice(width);
      }
    }

    if (line !== "") result.push(line);
  }

  return result.length ? result : [""];
}
