import { describe, expect, it } from "vitest";
import { AgentSession } from "./session.js";

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

describe("AgentSession queued messages", () => {
  it("queues steering and follow-up prompts while a prompt is running and drains them in order", async () => {
    const firstTurn = deferred();
    const promptsSeen = [];
    const agent = {
      systemPrompt: "System prompt",
      async runMessages(messages) {
        const prompt = messages.at(-1).content;
        promptsSeen.push(prompt);
        if (prompt === "first") await firstTurn.promise;
        messages.push({ role: "assistant", content: `answer:${prompt}` });
        return `answer:${prompt}`;
      },
    };
    const session = new AgentSession({ agent });
    const events = [];
    session.subscribe((event) => events.push(event));

    const run = session.prompt("first");
    await session.steer("steer now");
    await session.followUp("later");
    firstTurn.resolve();
    await run;

    expect(promptsSeen).toEqual(["first", "steer now", "later"]);
    expect(session.visibleMessages.map((m) => [m.role, m.content])).toEqual([
      ["user", "first"],
      ["assistant", "answer:first"],
      ["user", "steer now"],
      ["assistant", "answer:steer now"],
      ["user", "later"],
      ["assistant", "answer:later"],
    ]);
    expect(events.filter((e) => e.type === "queued_message").map((e) => [e.queue, e.text])).toEqual([
      ["steer", "steer now"],
      ["followUp", "later"],
    ]);
  });

  it("rejects an unclassified prompt while running", async () => {
    const firstTurn = deferred();
    const agent = {
      systemPrompt: "System prompt",
      async runMessages(messages) {
        await firstTurn.promise;
        messages.push({ role: "assistant", content: "done" });
        return "done";
      },
    };
    const session = new AgentSession({ agent });

    const run = session.prompt("first");
    await expect(session.prompt("second")).rejects.toThrow(/already running/);
    firstTurn.resolve();
    await run;
  });
});
