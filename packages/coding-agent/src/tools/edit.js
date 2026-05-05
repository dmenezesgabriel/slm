import { readFileSync, writeFileSync } from "fs";
import { Tool, z } from "@slms/core";
import { getDefaultCwd, resolveInsideCwd } from "./path-policy.js";

const editItemSchema = z.object({
  oldText: z.string().describe("The exact text to replace; must appear exactly once in the original file"),
  newText: z.string().describe("The replacement text"),
});

function countOccurrences(content, needle) {
  if (needle === "") return 0;
  let count = 0;
  let index = content.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = content.indexOf(needle, index + needle.length);
  }
  return count;
}

function normalizeEdits({ oldText, newText, edits }) {
  if (Array.isArray(edits) && edits.length > 0) return edits;
  if (typeof oldText === "string" && typeof newText === "string") return [{ oldText, newText }];
  throw new Error("No edits provided. Use either oldText/newText or edits[].");
}

function applyExactReplacements(content, edits) {
  const ranges = edits.map((edit) => {
    const count = countOccurrences(content, edit.oldText);
    if (count === 0) throw new Error(`oldText not found: ${edit.oldText}`);
    if (count > 1) throw new Error(`oldText appears ${count} times; it must be unique: ${edit.oldText}`);

    const start = content.indexOf(edit.oldText);
    return { ...edit, start, end: start + edit.oldText.length };
  });

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new Error("Edit ranges overlap; merge overlapping replacements into one edit.");
    }
  }

  let next = content;
  for (const edit of [...ranges].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, edit.start) + edit.newText + next.slice(edit.end);
  }
  return next;
}

export class EditTool extends Tool {
  name        = "edit";
  description = "Edit a file inside the current working directory by replacing exact strings. Supports oldText/newText for one edit or edits[] for multiple exact replacements. Each oldText must match exactly once in the original file.";
  schema      = z.object({
    path:    z.string().describe("Path to the file to edit, relative to the working directory unless absolute and inside it"),
    oldText: z.string().optional().describe("Single exact text to replace; use edits[] for multiple replacements"),
    newText: z.string().optional().describe("Replacement for oldText"),
    edits:   z.array(editItemSchema).optional().describe("Multiple exact replacements to apply based on the original file"),
  });

  constructor({ cwd = getDefaultCwd() } = {}) {
    super();
    this.cwd = cwd;
  }

  async execute(input) {
    try {
      const edits = normalizeEdits(input);
      const fullPath = resolveInsideCwd(input.path, this.cwd);
      const content = readFileSync(fullPath, "utf8");
      const next = applyExactReplacements(content, edits);
      writeFileSync(fullPath, next, "utf8");
      return `Applied ${edits.length} edit${edits.length === 1 ? "" : "s"} to ${input.path}`;
    } catch (err) {
      return { content: `Error: ${err.message}`, isError: true };
    }
  }
}

export { applyExactReplacements };
