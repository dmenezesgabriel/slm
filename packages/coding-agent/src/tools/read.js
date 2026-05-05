import { readFileSync } from "fs";
import { Tool, z } from "@slms/core";

export class ReadTool extends Tool {
  name        = "read";
  description = "Read the contents of a file. Supports text files. Output is truncated to 500 lines; use offset/limit for large files.";
  schema      = z.object({
    path:   z.string().describe("Path to the file to read"),
    offset: z.number().int().optional().describe("Line number to start reading from (1-indexed)"),
    limit:  z.number().int().optional().describe("Maximum number of lines to read"),
  });

  async execute({ path, offset, limit }) {
    try {
      const raw   = readFileSync(path, "utf8");
      const lines = raw.split("\n");
      const start = offset ? offset - 1 : 0;
      const end   = limit  ? start + limit : Math.min(lines.length, start + 500);
      const slice = lines.slice(start, end);
      const note  = end < lines.length ? `\n… (${lines.length - end} more lines)` : "";
      return slice.join("\n") + note;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }
}
