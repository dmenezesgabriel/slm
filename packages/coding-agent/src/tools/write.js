import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { Tool, z } from "@slms/core";
import { getDefaultCwd, resolveInsideCwd } from "./path-policy.js";

export class WriteTool extends Tool {
  name        = "write";
  description = "Write content to a file inside the current working directory. Creates the file and parent directories if needed; overwrites if it exists.";
  schema      = z.object({
    path:    z.string().describe("Path to the file to write, relative to the working directory unless absolute and inside it"),
    content: z.string().describe("Content to write"),
  });

  constructor({ cwd = getDefaultCwd() } = {}) {
    super();
    this.cwd = cwd;
  }

  async execute({ path, content }) {
    try {
      const fullPath = resolveInsideCwd(path, this.cwd);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, "utf8");
      const lines = content.split("\n").length;
      return `Written ${content.length} bytes (${lines} lines) to ${path}`;
    } catch (err) {
      return { content: `Error: ${err.message}`, isError: true };
    }
  }
}
