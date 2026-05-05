/** Base class for all TUI components. */
export class Component {
  /**
   * Render this component into an array of terminal rows.
   * Each element is one line; strings may contain ANSI escape codes.
   * @param {number} width  Available columns.
   * @returns {string[]}
   */
  render(width) {
    throw new Error(`${this.constructor.name}.render() not implemented`);
  }
}
