import { Component } from "../component.js";

/**
 * Lays children out vertically (default) or horizontally.
 *
 * Vertical: concatenates each child's lines with an optional gap.
 * Horizontal: splits width equally, renders each child in its column,
 *             pads shorter columns with empty lines.
 */
export class Container extends Component {
  constructor(children = [], opts = {}) {
    super();
    this.children  = Array.isArray(children) ? children : [children];
    this.direction = opts.direction ?? "vertical";
    this.gap       = opts.gap       ?? 0;
  }

  render(width) {
    if (this.direction === "vertical") {
      const out = [];
      for (let i = 0; i < this.children.length; i++) {
        if (i > 0 && this.gap > 0) out.push(...Array(this.gap).fill(""));
        out.push(...this.children[i].render(width));
      }
      return out;
    }

    // Horizontal: divide width evenly
    const colW   = Math.floor(width / this.children.length);
    const cols   = this.children.map((c) => c.render(colW));
    const maxH   = Math.max(...cols.map((c) => c.length));
    const result = [];
    for (let r = 0; r < maxH; r++) {
      result.push(cols.map((col) => (col[r] ?? "").padEnd(colW)).join(""));
    }
    return result;
  }
}
