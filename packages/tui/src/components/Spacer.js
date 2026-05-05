import { Component } from "../component.js";

/** Fixed-height empty space for layout padding. */
export class Spacer extends Component {
  constructor(height = 1) { super(); this.height = height; }
  render(_width) { return Array(this.height).fill(""); }
}
