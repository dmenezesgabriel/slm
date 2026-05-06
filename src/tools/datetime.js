import { z } from "zod";
import { Tool } from "../core/tool.js";

export class DateTimeTool extends Tool {
  name        = "get_date_time";
  description = "Use for questions about the current date or time. Returns the current date/time for a requested IANA timezone or the local timezone.";
  schema      = z.object({
    timezone: z.string().optional().describe("Optional IANA timezone, e.g. 'UTC' or 'America/Sao_Paulo'. Omit for local time."),
  });

  async execute({ timezone } = {}) {
    const options = timezone ? { timeZone: timezone } : undefined;
    return new Date().toLocaleString(undefined, options);
  }
}
