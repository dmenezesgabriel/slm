import { readFileSync } from "fs";
import { Component } from "../component.js";
import { color, style } from "../ansi.js";

/**
 * Display an image in the terminal.
 * Supports iTerm2 inline images protocol; falls back to a text label.
 */
export class Image extends Component {
  constructor(src, opts = {}) {
    super();
    this.src    = src;
    this.height = opts.height ?? 10;
  }

  render(width) {
    if (process.env.TERM_PROGRAM === "iTerm.app") {
      try {
        const b64 = readFileSync(this.src).toString("base64");
        // iTerm2 protocol: ESC ] 1337 ; File=inline=1;width=N;height=N: <base64> BEL
        const seq = `\x1b]1337;File=inline=1;width=${width};height=${this.height}:${b64}\x07`;
        return [seq, ...Array(this.height - 1).fill("")];
      } catch (_) { /* fall through */ }
    }
    return [color.dim + `[Image: ${this.src}]` + style.reset];
  }
}
