import { readFileSync, writeFileSync } from "fs";
import { Tool, z } from "@slms/core";

export class EditTool extends Tool {
  name        = "edit";
  description = "Edit a file by replacing an exact string. oldText must match exactly once in the file — this guarantees surgical edits with no accidental collateral changes.";
  schema      = z.object({
    path:    z.string().describe("Path to the file to edit"),
    oldText: z.string().describe("The exact text to replace (must appear exactly once)"),
    newText: z.string().describe("The replacement text"),
  });

  async execute({ path, oldText, newText }) {
    try {
      const content = readFileSync(path, "utf8");
      const count   = content.split(oldText).length - 1;
      if (count === 0) return `Error: oldText not found in ${path}`;
      if (count  > 1) return `Error: oldText appears ${count} times in ${path}; it must be unique`;
      writeFileSync(path, content.replace(oldText, newText), "utf8");
      return `Replaced 1 occurrence in ${path}`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }
}
