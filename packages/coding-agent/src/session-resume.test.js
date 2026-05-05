import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlSessionStore } from "./session-store.js";

const tempDirs = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "slms-session-resume-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("JsonlSessionStore resume", () => {
  it("discovers saved sessions for the current project", () => {
    const rootDir = tempDir();
    const first = new JsonlSessionStore({ cwd: "/project", rootDir });
    first.append({ type: "message", message: { role: "user", content: "first" } });
    const second = new JsonlSessionStore({ cwd: "/project", rootDir });
    second.append({ type: "message", message: { role: "user", content: "second" } });

    const sessions = JsonlSessionStore.listSessions({ cwd: "/project", rootDir });

    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sessionFile)).toContain(first.getInfo().sessionFile);
    expect(sessions.map((s) => s.sessionFile)).toContain(second.getInfo().sessionFile);
    expect(sessions[0]).toMatchObject({ sessionId: expect.any(String), entryCount: 1, cwd: "/project" });
  });

  it("resumes a saved session and returns model-visible messages", () => {
    const rootDir = tempDir();
    const original = new JsonlSessionStore({ cwd: "/project", rootDir });
    original.append({ type: "message", message: { role: "user", content: "remember me" } });
    original.append({ type: "message", message: { role: "assistant", content: "I remember" } });

    const resumed = new JsonlSessionStore({ cwd: "/project", rootDir });
    const messages = resumed.resume(original.getInfo().sessionFile);

    expect(resumed.getInfo()).toMatchObject({
      sessionId: original.getInfo().sessionId,
      sessionFile: original.getInfo().sessionFile,
      entryCount: 2,
    });
    expect(messages).toEqual([
      { role: "user", content: "remember me" },
      { role: "assistant", content: "I remember" },
    ]);
  });

  it("appends new entries to a resumed session", () => {
    const rootDir = tempDir();
    const original = new JsonlSessionStore({ cwd: "/project", rootDir });
    original.append({ type: "message", message: { role: "user", content: "old" } });

    const resumed = new JsonlSessionStore({ cwd: "/project", rootDir });
    resumed.resume(original.getInfo().sessionFile);
    resumed.append({ type: "message", message: { role: "user", content: "new" } });

    expect(resumed.resume(original.getInfo().sessionFile)).toEqual([
      { role: "user", content: "old" },
      { role: "user", content: "new" },
    ]);
  });
});
