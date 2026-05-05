import { Component } from "../component.js";
import { color, style } from "../ansi.js";
import { strip } from "../strip.js";

export { getFileCompletions, triggerFileCompletion } from "./filepaths.js";
export { SlashCommands } from "./slashcommands.js";

/**
 * Dropdown overlay showing autocomplete suggestions.
 * Renders above/below the input line; the app decides where to place it.
 *
 * Call show(items) with [{ label, value }] to display suggestions.
 * Call hide() to collapse.
 * handleKey() intercepts up/down/tab/return/escape.
 * selectedItem returns the currently highlighted item or null.
 */
export class Autocomplete extends Component {
  constructor() {
    super();
    this.items    = [];
    this.selected = 0;
    this.visible  = false;
  }

  show(items) {
    this.items    = items;
    this.selected = 0;
    this.visible  = items.length > 0;
  }

  hide() {
    this.visible = false;
    this.items   = [];
  }

  get selectedItem() {
    return this.visible ? (this.items[this.selected] ?? null) : null;
  }

  /**
   * Handle a key event.
   * Returns the selected item object when the user confirms (tab/return),
   * true when consumed but not confirmed, false when not handled.
   */
  handleKey(key) {
    if (!this.visible) return false;
    switch (key.name) {
      case "up":
        this.selected = Math.max(0, this.selected - 1);
        return true;
      case "down":
        this.selected = Math.min(this.items.length - 1, this.selected + 1);
        return true;
      case "tab":
      case "return":
        return this.items[this.selected] ?? false;
      case "escape":
        this.hide();
        return true;
      default:
        return false;
    }
  }

  render(width) {
    if (!this.visible || this.items.length === 0) return [];
    return this.items.map((item, i) => {
      const label = strip(typeof item === "string" ? item : item.label).slice(0, width - 2);
      if (i === this.selected) {
        return color.bgRgb(30, 70, 30) + color.brightWhite + " " + label.padEnd(width - 1) + style.reset;
      }
      return color.bgRgb(15, 15, 15) + color.white + " " + label.padEnd(width - 1) + style.reset;
    });
  }
}
