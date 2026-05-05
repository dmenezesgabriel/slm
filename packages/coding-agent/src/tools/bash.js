import { execSync } from "child_process";
import { Tool, z } from "@slms/core";

export class BashTool extends Tool {
  name        = "bash";
  description = "Execute a bash command. Returns stdout and stderr combined. Prefer non-interactive commands; avoid editors or long-running processes.";
  schema      = z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z.number().int().optional().describe("Timeout in milliseconds (default: 30000)"),
  });

  async execute({ command, timeout = 30_000 }) {
    try {
      const out = execSync(command, {
        timeout,
        encoding:  "utf8",
        stdio:     ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,  // 10 MB
      });
      return out || "(no output)";
    } catch (err) {
      const parts = [err.stdout, err.stderr, `Exit ${err.status ?? "?"}`].filter(Boolean);
      return parts.join("\n");
    }
  }
}
