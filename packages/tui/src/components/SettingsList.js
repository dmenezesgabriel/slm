import { Component } from "../component.js";
import { style, color } from "../ansi.js";
import { strip } from "../strip.js";

/**
 * Renders a key→value settings list.
 * Accepts an object or an array of { key, value } entries.
 */
export class SettingsList extends Component {
  constructor(settings = {}) {
    super();
    this.settings = settings;
  }

  render(width) {
    const entries = Array.isArray(this.settings)
      ? this.settings
      : Object.entries(this.settings).map(([key, value]) => ({ key, value }));

    const keyWidth = Math.min(24, Math.floor(width * 0.35));

    return entries.map(({ key, value }) => {
      const k = strip(String(key)).slice(0, keyWidth).padEnd(keyWidth);
      const v = String(value).slice(0, width - keyWidth - 2);
      return style.bold + color.brightCyan + k + style.reset + "  " + v;
    });
  }
}
