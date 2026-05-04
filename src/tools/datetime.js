import { z } from "zod";
import { Tool } from "../core/tool.js";

export class DateTimeTool extends Tool {
  name        = "get_date_time";
  description = "Returns the current local date and time. No input required.";
  schema      = z.object({});

  async execute(_) {
    return new Date().toLocaleString();
  }
}
