import { describe, expect, it } from "vitest";
import { AgentSession } from "./session.js";

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

describe("AgentSession abort", () => {
  it("passes an abort signal to the active agent run and emits aborted", async () => {
    const started = deferred();
    const agent = {
      systemPrompt: "System prompt",
      async runMessages(_messages, { signal }) {
        started.resolve(signal);
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
    };
    const session = new AgentSession({ agent });
    const events = [];
    session.subscribe((event) => events.push(event));

    const run = session.prompt("long task");
    const signal = await started.promise;
    await session.steer("preserved steering");
    session.abort();

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(signal.aborted).toBe(true);
    expect(session.isRunning).toBe(false);
    expect(session.queuedMessages).toEqual({ steer: ["preserved steering"], followUp: [] });
    expect(events.map((e) => e.type)).toContain("aborted");
  });
});
