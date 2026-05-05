import { Component } from "../component.js";
import { color, style } from "../ansi.js";

const FRAMES = ["⠋", "⠙", "⠸", "⠴", "⠦", "⠇"];

/**
 * Animated spinner with a message.
 * Call start(onTick) to begin animating and stop() to halt.
 */
export class Loader extends Component {
  constructor(message = "Loading…") {
    super();
    this.message   = message;
    this.frame     = 0;
    this._interval = null;
  }

  /**
   * Begin animating; calls `onTick()` after each frame advance
   * so the caller can trigger a re-render.
   */
  start(onTick) {
    if (this._interval) return this;
    this._interval = setInterval(() => {
      this.frame = (this.frame + 1) % FRAMES.length;
      onTick?.();
    }, 80);
    return this;
  }

  stop() {
    clearInterval(this._interval);
    this._interval = null;
    return this;
  }

  tick() { this.frame = (this.frame + 1) % FRAMES.length; }

  render(_width) {
    return [color.brightCyan + FRAMES[this.frame] + style.reset + " " + this.message];
  }
}
