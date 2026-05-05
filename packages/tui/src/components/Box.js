import { Component } from "../component.js";
import { style, color } from "../ansi.js";
import { strip, padEnd } from "../strip.js";

/**
 * Draws a box (border + optional title) around one or more child components.
 *
 * opts: { title?, borderColor?, padding? }
 */
export class Box extends Component {
  constructor(children = [], opts = {}) {
    super();
    this.children     = Array.isArray(children) ? children : [children];
    this.title        = opts.title       ?? "";
    this.borderColor  = opts.borderColor ?? color.gray;
    this.padding      = opts.padding     ?? 0;
  }

  render(width) {
    const bc       = this.borderColor;
    const rs       = style.reset;
    const inner    = width - 2;                     // inside the │ chars
    const padded   = inner - this.padding * 2;

    // Collect child lines
    const childLines = [];
    for (const child of this.children)
      childLines.push(...child.render(padded));

    // Top border — weave title into the line
    const titleStr = this.title ? ` ${strip(this.title)} ` : "";
    const fill     = "─".repeat(Math.max(0, inner - titleStr.length));
    const top      = bc + "┌" + titleStr + fill + "┐" + rs;

    // Content rows
    const pad = " ".repeat(this.padding);
    const rows = childLines.map((l) => {
      const cell = pad + l + pad;
      // Pad to exact inner width using visible length
      return bc + "│" + rs + padEnd(cell, inner) + bc + "│" + rs;
    });

    const bottom = bc + "└" + "─".repeat(inner) + "┘" + rs;
    return [top, ...rows, bottom];
  }
}
