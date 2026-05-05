import { Component } from "../component.js";
import { wrap } from "../wrap.js";
import { style } from "../ansi.js";

export class Text extends Component {
  /**
   * @param {string} content
   * @param {{ bold?, dim?, color?, wrap? }} [opts]
   *   color — any ANSI color/style prefix string (e.g. `ansi.color.green`)
   */
  constructor(content = "", opts = {}) {
    super();
    this.content = content;
    this.opts    = opts;
  }

  render(width) {
    const shouldWrap = this.opts.wrap !== false;
    const lines = shouldWrap ? wrap(String(this.content), width)
                             : [String(this.content)];

    const { bold, dim, color: col } = this.opts;
    if (!bold && !dim && !col) return lines;

    const prefix = (bold ? style.bold : "")
                 + (dim  ? style.dim  : "")
                 + (col  ? col        : "");
    const suffix = style.reset;
    return lines.map((l) => prefix + l + suffix);
  }
}
