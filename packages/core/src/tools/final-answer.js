import { z } from "zod";
import { Tool } from "../tool.js";

export class FinalAnswerTool extends Tool {
  name = "final_answer";
  description = "Return the final answer to the user when the task is complete. Use this after any required tool work is done.";
  schema = z.object({
    answer: z.string().describe("The final answer to show to the user."),
  });

  async execute({ answer }) {
    return answer;
  }
}
