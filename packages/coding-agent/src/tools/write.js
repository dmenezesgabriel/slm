import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { Tool, z } from "@slms/core";

export class WriteTool extends Tool {
  name        = "write";
  description = "Write content to a file. Creates the file (and parent directories) if they don't exist; overwrites if it does.";
  schema      = z.object({
    path:    z.string().describe("Path to the file to write"),
    content: z.string().describe("Content to write"),
  });

  async execute({ path, content }) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content, "utf8");
      const lines = content.split("\n").length;
      return `Written ${content.length} bytes (${lines} lines) to ${path}`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  }
}
