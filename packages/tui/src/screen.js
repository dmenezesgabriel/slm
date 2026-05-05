import { EventEmitter } from "events";
import { cursor, erase, sync, paste } from "./ansi.js";

/**
 * Manages the raw terminal: raw mode, resize events, key parsing,
 * bracketed paste, and atomic writes via CSI 2026.
 *
 * Events emitted:
 *   "key"    { name, char?, raw }   — a single key or sequence
 *   "paste"  { text, lines, large } — bracketed paste (large = lines > 10)
 *   "resize" { width, height }      — terminal resize
 */
export class Screen extends EventEmitter {
  constructor({ input = process.stdin, output = process.stdout } = {}) {
    super();
    this.input  = input;
    this.output = output;
    this._pasteBuffer = null;
    this._started = false;
  }

  get width()  { return this.output.columns ?? 80; }
  get height() { return this.output.rows    ?? 24; }

  start() {
    if (this._started) return;
    this._started = true;

    if (this.input.isTTY)  this.input.setRawMode(true);
    this.input.resume();
    this.input.setEncoding("utf8");

    // Hide cursor; enable bracketed paste mode
    this.output.write(cursor.hide + paste.enable);

    this.input.on("data", (d) => this._onData(d));

    this.output.on("resize", () =>
      this.emit("resize", { width: this.width, height: this.height }),
    );

    const cleanup = () => this.stop();
    process.once("exit",   cleanup);
    process.once("SIGINT",  () => { cleanup(); process.exit(0); });
    process.once("SIGTERM", () => { cleanup(); process.exit(0); });
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    this.output.write(
      cursor.show + paste.disable + erase.screen + cursor.to(1, 1),
    );
    if (this.input.isTTY) this.input.setRawMode(false);
    this.input.pause();
  }

  /**
   * Write `str` to the terminal wrapped in CSI 2026 synchronized-output
   * markers so the terminal paints everything atomically (no flicker).
   */
  write(str) {
    this.output.write(sync.begin + str + sync.end);
  }

  /** Low-level unbuffered write (no sync markers). */
  rawWrite(str) {
    this.output.write(str);
  }

  // ── input ───────────────────────────────────────────────────────────────────

  _onData(data) {
    // Bracketed paste: accumulate between markers
    if (this._pasteBuffer !== null) {
      const endIdx = data.indexOf("\x1b[201~");
      if (endIdx !== -1) {
        this._pasteBuffer += data.slice(0, endIdx);
        const text = this._pasteBuffer;
        this._pasteBuffer = null;
        const lines = text.split("\n");
        this.emit("paste", { text, lines, large: lines.length > 10 });
        // handle any data after the end marker
        const rest = data.slice(endIdx + 6);
        if (rest) this._onData(rest);
      } else {
        this._pasteBuffer += data;
      }
      return;
    }

    if (data.startsWith("\x1b[200~")) {
      this._pasteBuffer = "";
      const rest = data.slice(6);
      if (rest) this._onData(rest); // might contain end marker immediately
      return;
    }

    const key = this._parseKey(data);
    this.emit("key", key);
  }

  _parseKey(data) {
    const MAP = {
      "\x1b[A":    "up",         "\x1b[B":    "down",
      "\x1b[C":    "right",      "\x1b[D":    "left",
      "\x1b[H":    "home",       "\x1b[F":    "end",
      "\x1b[2~":   "insert",     "\x1b[3~":   "delete",
      "\x1b[5~":   "pageup",     "\x1b[6~":   "pagedown",
      "\x1b[1;5C": "ctrl-right", "\x1b[1;5D": "ctrl-left",
      "\x1b[1;5A": "ctrl-up",    "\x1b[1;5B": "ctrl-down",
      "\r": "return",  "\n": "return",
      "\x7f": "backspace",  "\x08": "backspace",
      "\t":   "tab",
      "\x1b": "escape",
      "\x01": "ctrl-a",  "\x02": "ctrl-b",  "\x03": "ctrl-c",
      "\x04": "ctrl-d",  "\x05": "ctrl-e",  "\x06": "ctrl-f",
      "\x0b": "ctrl-k",  "\x0c": "ctrl-l",  "\x0e": "ctrl-n",
      "\x10": "ctrl-p",  "\x11": "ctrl-q",  "\x15": "ctrl-u",
      "\x17": "ctrl-w",  "\x19": "ctrl-y",  "\x1a": "ctrl-z",
    };

    if (MAP[data]) return { name: MAP[data], raw: data };
    if (data.length === 1 && data.charCodeAt(0) >= 32)
      return { name: "char", char: data, raw: data };
    return { name: "unknown", raw: data };
  }
}
