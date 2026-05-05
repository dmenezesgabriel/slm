import { execSync } from "child_process";
import { Tool, z } from "@slms/core";
import { getDefaultCwd } from "./path-policy.js";
import { isDestructiveCommand } from "./destructive-command.js";

export class BashTool extends Tool {
  name        = "bash";
  description = "Execute a non-interactive bash command in the current working directory. Returns stdout and stderr combined. Destructive commands require confirmation.";
  schema      = z.object({
    command: z.string().describe("The bash command to execute"),
    timeout: z.number().int().optional().describe("Timeout in milliseconds (default: 30000)"),
  });

  constructor({ cwd = getDefaultCwd(), confirmDestructive = null } = {}) {
    super();
    this.cwd = cwd;
    this.confirmDestructive = confirmDestructive;
  }

  async execute({ command, timeout = 30_000 }) {
    if (isDestructiveCommand(command)) {
      const confirmed = this.confirmDestructive
        ? await this.confirmDestructive({ command })
        : false;
      if (!confirmed) {
        return { content: `Destructive command not confirmed: ${command}`, isError: true };
      }
    }

    try {
      const out = execSync(command, {
        cwd:       this.cwd,
        timeout,
        encoding:  "utf8",
        stdio:     ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,  // 10 MB
      });
      return out || "(no output)";
    } catch (err) {
      const parts = [err.stdout, err.stderr, `Exit ${err.status ?? "?"}`].filter(Boolean);
      return { content: parts.join("\n"), isError: true };
    }
  }
}
