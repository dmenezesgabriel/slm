import { z } from "zod";
import { Tool } from "../tool.js";

export class WikipediaTool extends Tool {
  name        = "wikipedia";
  description = "Fetches a short summary about a topic from Wikipedia.";
  schema      = z.object({
    topic: z.string().describe("The Wikipedia article title or search query, e.g. 'Python programming language'"),
  });

  async execute({ topic }) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`;
    const res  = await fetch(url);
    if (!res.ok) return `Wikipedia returned HTTP ${res.status} for: ${topic}`;
    const data = await res.json();
    return data.extract ?? "No extract available.";
  }
}
