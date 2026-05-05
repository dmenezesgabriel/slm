import { EventEmitter } from "events";
import { Component } from "../component.js";
import { color, style } from "../ansi.js";
import { strip } from "../strip.js";

/**
 * Single-line text input with visible cursor, horizontal scroll, and
 * common readline-style key bindings.
 *
 * Events: "submit" (value), "change" (value), "complete" (value, cursor)
 */
export class Input extends Component {
  constructor(opts = {}) {
    super();
    this.value       = opts.value       ?? "";
    this.cursor      = this.value.length;
    this.placeholder = opts.placeholder ?? "";
    this.prefix      = opts.prefix      ?? "> ";
    this.disabled    = opts.disabled    ?? false;
    this._emitter    = new EventEmitter();
  }

  on(event, fn) { this._emitter.on(event, fn); return this; }
  off(event, fn) { this._emitter.off(event, fn); return this; }

  handleKey(key) {
    if (this.disabled) return false;
    switch (key.name) {
      case "return":
        this._emitter.emit("submit", this.value);
        return true;

      case "backspace":
        if (this.cursor > 0) {
          this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
          this.cursor--;
          this._emit();
        }
        return true;

      case "delete":
        if (this.cursor < this.value.length) {
          this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
          this._emit();
        }
        return true;

      case "left":       this.cursor = Math.max(0, this.cursor - 1); return true;
      case "right":      this.cursor = Math.min(this.value.length, this.cursor + 1); return true;
      case "home":
      case "ctrl-a":     this.cursor = 0; return true;
      case "end":
      case "ctrl-e":     this.cursor = this.value.length; return true;

      case "ctrl-u":
        this.value  = this.value.slice(this.cursor);
        this.cursor = 0;
        this._emit();
        return true;

      case "ctrl-k":
        this.value = this.value.slice(0, this.cursor);
        this._emit();
        return true;

      case "ctrl-w": {
        const before  = this.value.slice(0, this.cursor);
        const trimmed = before.replace(/\S+\s*$/, "");
        this.value    = trimmed + this.value.slice(this.cursor);
        this.cursor   = trimmed.length;
        this._emit();
        return true;
      }

      case "ctrl-left":
        while (this.cursor > 0 && this.value[this.cursor - 1] === " ") this.cursor--;
        while (this.cursor > 0 && this.value[this.cursor - 1] !== " ") this.cursor--;
        return true;

      case "ctrl-right":
        while (this.cursor < this.value.length && this.value[this.cursor] === " ") this.cursor++;
        while (this.cursor < this.value.length && this.value[this.cursor] !== " ") this.cursor++;
        return true;

      case "tab":
        this._emitter.emit("complete", this.value, this.cursor);
        return true;

      case "char":
        this.value = this.value.slice(0, this.cursor) + key.char + this.value.slice(this.cursor);
        this.cursor++;
        this._emit();
        return true;

      default:
        return false;
    }
  }

  /** Insert text at cursor (e.g. from paste or autocomplete). */
  insert(text) {
    this.value  = this.value.slice(0, this.cursor) + text + this.value.slice(this.cursor);
    this.cursor += text.length;
    this._emit();
  }

  clear() {
    this.value  = "";
    this.cursor = 0;
    this._emit();
  }

  render(width) {
    const prefixLen = strip(this.prefix).length;
    const available = Math.max(1, width - prefixLen);

    if (!this.value && this.placeholder) {
      const ph = strip(this.placeholder).slice(0, available);
      return [this.prefix + style.dim + ph + style.reset];
    }

    // Horizontal scroll: keep cursor visible
    let start = 0;
    if (this.cursor >= available) start = this.cursor - available + 1;

    const visible   = this.value.slice(start, start + available);
    const relCursor = this.cursor - start;

    const before = visible.slice(0, relCursor);
    const atChar = visible[relCursor] ?? " ";
    const after  = visible.slice(relCursor + 1);

    const cursorBlock = color.bgRgb(80, 80, 80) + atChar + style.reset;
    return [this.prefix + before + cursorBlock + after];
  }

  _emit() { this._emitter.emit("change", this.value); }
}
