import { Component } from "../component.js";
import { style, color } from "../ansi.js";
import { wrap } from "../wrap.js";

/**
 * Renders a Markdown string to ANSI-coloured terminal lines.
 * Supports: headers, bold/italic/strike/code inline, fenced code blocks,
 * blockquotes, ordered/unordered lists, and horizontal rules.
 */
export class Markdown extends Component {
  constructor(content = "") {
    super();
    this.content = content;
  }

  render(width) {
    const result     = [];
    const lines      = String(this.content).split("\n");
    let inCode       = false;
    let codeLines    = [];

    for (const line of lines) {
      // ── fenced code block ────────────────────────────────────────────────
      if (line.startsWith("```")) {
        if (!inCode) {
          inCode = true; codeLines = [];
        } else {
          inCode = false;
          const inner = width - 4;
          result.push(color.gray + "┌" + "─".repeat(width - 2) + "┐" + style.reset);
          for (const cl of codeLines) {
            const text = cl.slice(0, inner).padEnd(inner);
            result.push(color.gray + "│ " + style.reset + color.fg(220) + text + style.reset + color.gray + " │" + style.reset);
          }
          result.push(color.gray + "└" + "─".repeat(width - 2) + "┘" + style.reset);
        }
        continue;
      }

      if (inCode) { codeLines.push(line); continue; }

      // ── headers ──────────────────────────────────────────────────────────
      const h1 = line.match(/^#\s+(.+)/);
      const h2 = line.match(/^##\s+(.+)/);
      const h3 = line.match(/^###\s+(.+)/);
      if (h1) { result.push(style.bold + color.brightWhite + h1[1] + style.reset); continue; }
      if (h2) { result.push(style.bold + color.brightCyan  + h2[1] + style.reset); continue; }
      if (h3) { result.push(style.bold + color.cyan        + h3[1] + style.reset); continue; }

      // ── horizontal rule ───────────────────────────────────────────────────
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        result.push(color.gray + "─".repeat(width) + style.reset);
        continue;
      }

      // ── blockquote ────────────────────────────────────────────────────────
      const bq = line.match(/^>\s*(.*)/);
      if (bq) {
        for (const l of wrap(bq[1], width - 2))
          result.push(color.gray + "▎ " + style.reset + style.dim + l + style.reset);
        continue;
      }

      // ── unordered list ────────────────────────────────────────────────────
      const ul = line.match(/^(\s*)[-*+]\s+(.+)/);
      if (ul) {
        const depth  = Math.floor(ul[1].length / 2);
        const indent = "  ".repeat(depth);
        const bullet = indent + color.brightCyan + "•" + style.reset + " ";
        const wrapped = wrap(ul[2], width - indent.length - 2);
        result.push(bullet + this._inline(wrapped[0]));
        for (let i = 1; i < wrapped.length; i++)
          result.push(indent + "  " + this._inline(wrapped[i]));
        continue;
      }

      // ── ordered list ──────────────────────────────────────────────────────
      const ol = line.match(/^(\d+)\.\s+(.+)/);
      if (ol) {
        const num = color.brightCyan + ol[1] + "." + style.reset + " ";
        const wrapped = wrap(ol[2], width - ol[1].length - 2);
        result.push(num + this._inline(wrapped[0]));
        for (let i = 1; i < wrapped.length; i++)
          result.push(" ".repeat(ol[1].length + 2) + this._inline(wrapped[i]));
        continue;
      }

      // ── empty line ────────────────────────────────────────────────────────
      if (line.trim() === "") { result.push(""); continue; }

      // ── paragraph ────────────────────────────────────────────────────────
      for (const l of wrap(line, width))
        result.push(this._inline(l));
    }

    return result;
  }

  /** Apply inline ANSI formatting for bold/italic/code/strike/links. */
  _inline(text) {
    return text
      .replace(/`([^`]+)`/g,         (_, c) => color.fg(220) + c + style.reset)
      .replace(/\*\*([^*]+)\*\*/g,   (_, c) => style.bold + c + style.reset)
      .replace(/__([^_]+)__/g,       (_, c) => style.bold + c + style.reset)
      .replace(/\*([^*\s][^*]*)\*/g, (_, c) => style.italic + c + style.reset)
      .replace(/_([^_\s][^_]*)_/g,   (_, c) => style.italic + c + style.reset)
      .replace(/~~([^~]+)~~/g,       (_, c) => style.strike + c + style.reset)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, (_, label) =>
        style.underline + color.brightCyan + label + style.reset);
  }
}
