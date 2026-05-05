import { Component } from "../component.js";
import { strip } from "../strip.js";
import { style } from "../ansi.js";

export class TruncatedText extends Component {
  /** @param {string} content @param {{ align?, bold?, color? }} [opts] */
  constructor(content = "", opts = {}) {
    super();
    this.content = content;
    this.opts    = opts;
  }

  render(width) {
    const plain = strip(String(this.content));
    let line = plain.length > width ? plain.slice(0, width - 1) + "…" : plain;

    if (this.opts.align === "center") {
      const pad = Math.max(0, Math.floor((width - line.length) / 2));
      line = " ".repeat(pad) + line;
    } else if (this.opts.align === "right") {
      line = line.padStart(width);
    }

    const { bold, color: col } = this.opts;
    if (bold || col) {
      line = (bold ? style.bold : "") + (col ? col : "") + line + style.reset;
    }
    return [line];
  }
}
