import { EventEmitter } from "events";
import { Component } from "../component.js";
import { color, style } from "../ansi.js";

/**
 * Multi-line text editor with arrow-key navigation and vertical scroll.
 * Events: "change" (value)
 */
export class Editor extends Component {
  constructor(opts = {}) {
    super();
    this.value      = opts.value     ?? "";
    this.maxHeight  = opts.maxHeight ?? 10;
    this.cursorX    = 0;
    this.cursorY    = 0;
    this._scrollY   = 0;
    this._emitter   = new EventEmitter();
  }

  on(event, fn) { this._emitter.on(event, fn); return this; }

  get _lines() { return this.value.split("\n"); }

  handleKey(key) {
    const lines = this._lines;
    switch (key.name) {
      case "return": {
        const line = lines[this.cursorY];
        lines[this.cursorY] = line.slice(0, this.cursorX);
        lines.splice(this.cursorY + 1, 0, line.slice(this.cursorX));
        this.cursorY++;
        this.cursorX = 0;
        this.value = lines.join("\n");
        this._scroll();
        this._emitter.emit("change", this.value);
        return true;
      }

      case "backspace":
        if (this.cursorX > 0) {
          lines[this.cursorY] = lines[this.cursorY].slice(0, this.cursorX - 1)
                              + lines[this.cursorY].slice(this.cursorX);
          this.cursorX--;
        } else if (this.cursorY > 0) {
          const removed = lines.splice(this.cursorY, 1)[0];
          this.cursorY--;
          this.cursorX = lines[this.cursorY].length;
          lines[this.cursorY] += removed;
        }
        this.value = lines.join("\n");
        this._emitter.emit("change", this.value);
        return true;

      case "left":
        if (this.cursorX > 0) this.cursorX--;
        else if (this.cursorY > 0) { this.cursorY--; this.cursorX = lines[this.cursorY].length; }
        return true;

      case "right":
        if (this.cursorX < lines[this.cursorY].length) this.cursorX++;
        else if (this.cursorY < lines.length - 1) { this.cursorY++; this.cursorX = 0; }
        return true;

      case "up":
        if (this.cursorY > 0) {
          this.cursorY--;
          this.cursorX = Math.min(this.cursorX, lines[this.cursorY].length);
          this._scroll();
        }
        return true;

      case "down":
        if (this.cursorY < lines.length - 1) {
          this.cursorY++;
          this.cursorX = Math.min(this.cursorX, lines[this.cursorY].length);
          this._scroll();
        }
        return true;

      case "home":  this.cursorX = 0; return true;
      case "end":   this.cursorX = lines[this.cursorY].length; return true;

      case "char":
        lines[this.cursorY] = lines[this.cursorY].slice(0, this.cursorX)
                            + key.char
                            + lines[this.cursorY].slice(this.cursorX);
        this.cursorX++;
        this.value = lines.join("\n");
        this._emitter.emit("change", this.value);
        return true;

      default:
        return false;
    }
  }

  _scroll() {
    if (this.cursorY < this._scrollY) this._scrollY = this.cursorY;
    if (this.cursorY >= this._scrollY + this.maxHeight)
      this._scrollY = this.cursorY - this.maxHeight + 1;
  }

  render(width) {
    const lines   = this._lines;
    const visible = lines.slice(this._scrollY, this._scrollY + this.maxHeight);
    return visible.map((line, i) => {
      const row    = i + this._scrollY;
      const clipped = line.slice(0, width);
      if (row !== this.cursorY) return clipped;
      const before = clipped.slice(0, this.cursorX);
      const at     = clipped[this.cursorX] ?? " ";
      const after  = clipped.slice(this.cursorX + 1);
      return before + color.bgRgb(80, 80, 80) + at + style.reset + after;
    });
  }
}
