import { cursor, erase, sync } from "./ansi.js";

/**
 * Three-strategy differential renderer.
 *
 * Strategy selection (per frame):
 *   FULL    — first render, terminal resize, or >50 % of rows changed.
 *             Clears the screen and repaints everything.
 *   PARTIAL — only the rows that changed are repositioned and rewritten.
 *   INLINE  — caller asserts exactly one row changed (hint.inlineRow).
 *             Moves to that row and overwrites it in place; cheapest path,
 *             used for cursor movement and single-character edits.
 *
 * Every write is wrapped in CSI ?2026h … ?2026l (Synchronized Output) so
 * the terminal buffers all updates and paints them atomically.
 */
export class Renderer {
  constructor(output = process.stdout) {
    this.output = output;
    this._prev  = [];
    this._force = true; // always do a full render on the first frame
  }

  /** Force a full repaint on the next render() call. */
  forceFullRender() { this._force = true; }

  /**
   * Render a new frame.
   * @param {string[]} lines      One string per terminal row (may contain ANSI).
   * @param {object}  [hints]
   * @param {number}  [hints.inlineRow]  Row index that changed (enables INLINE strategy).
   */
  render(lines, hints = {}) {
    const strategy = this._pick(lines, hints);
    if (!strategy) return; // nothing changed

    const payload = strategy === "full"    ? this._full(lines)
                  : strategy === "inline"  ? this._inline(lines, hints.inlineRow)
                  :                          this._partial(lines);

    this.output.write(sync.begin + payload + sync.end);
    this._prev  = lines.slice();
    this._force = false;
  }

  // ── strategy selection ───────────────────────────────────────────────────────

  _pick(lines, hints) {
    if (this._force || lines.length !== this._prev.length) return "full";

    // Count changed rows
    let changed = 0;
    for (let i = 0; i < lines.length; i++)
      if (lines[i] !== this._prev[i]) changed++;

    if (changed === 0) return null;

    // INLINE: caller told us exactly which row changed, and only that row did
    if (hints.inlineRow !== undefined && changed === 1 &&
        lines[hints.inlineRow] !== this._prev[hints.inlineRow]) {
      return "inline";
    }

    // FULL when majority of rows differ (repositioning every row costs more
    // than a single clear+redraw)
    return changed >= Math.ceil(lines.length * 0.5) ? "full" : "partial";
  }

  // ── rendering strategies ─────────────────────────────────────────────────────

  _full(lines) {
    // Clear screen, home cursor, write all lines separated by CRLF
    return erase.screen + cursor.to(1, 1) + lines.join("\r\n");
  }

  _partial(lines) {
    let out = "";
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== this._prev[i]) {
        // Move to row i+1, col 1; erase entire line; write new content
        out += cursor.to(i + 1, 1) + erase.line + lines[i];
      }
    }
    return out;
  }

  _inline(lines, row) {
    // Move to the single changed row; erase from cursor to end of line;
    // write the new content. Slightly cheaper than erasing the whole line
    // because it avoids a redundant write for the prefix.
    return cursor.to(row + 1, 1) + erase.line + lines[row];
  }
}
