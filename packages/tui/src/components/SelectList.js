import { EventEmitter } from "events";
import { Component } from "../component.js";
import { color, style } from "../ansi.js";
import { strip } from "../strip.js";

/**
 * Scrollable list with keyboard selection.
 * Items: string[] or { label: string, value: any }[]
 * Events: "select" (item, index)
 */
export class SelectList extends Component {
  constructor(items = [], opts = {}) {
    super();
    this.items    = items;
    this.selected = opts.selected ?? 0;
    this.maxRows  = opts.maxRows  ?? 8;
    this._scroll  = 0;
    this._emitter = new EventEmitter();
  }

  on(event, fn) { this._emitter.on(event, fn); return this; }

  get selectedItem() {
    const it = this.items[this.selected];
    return typeof it === "string" ? { label: it, value: it } : it;
  }

  handleKey(key) {
    switch (key.name) {
      case "up":
        if (this.selected > 0) { this.selected--; this._adjust(); }
        return true;
      case "down":
        if (this.selected < this.items.length - 1) { this.selected++; this._adjust(); }
        return true;
      case "pageup":
        this.selected = Math.max(0, this.selected - this.maxRows);
        this._adjust();
        return true;
      case "pagedown":
        this.selected = Math.min(this.items.length - 1, this.selected + this.maxRows);
        this._adjust();
        return true;
      case "home":  this.selected = 0; this._adjust(); return true;
      case "end":   this.selected = this.items.length - 1; this._adjust(); return true;
      case "return":
        this._emitter.emit("select", this.selectedItem, this.selected);
        return true;
      default:
        return false;
    }
  }

  _adjust() {
    if (this.selected < this._scroll)
      this._scroll = this.selected;
    if (this.selected >= this._scroll + this.maxRows)
      this._scroll = this.selected - this.maxRows + 1;
  }

  render(width) {
    return this.items.slice(this._scroll, this._scroll + this.maxRows).map((it, i) => {
      const idx   = i + this._scroll;
      const label = typeof it === "string" ? it : it.label;
      const text  = strip(label).slice(0, width - 2);
      if (idx === this.selected) {
        return color.bgRgb(40, 40, 100) + color.brightWhite +
               "▶ " + text.padEnd(width - 2) + style.reset;
      }
      return "  " + text;
    });
  }
}
