import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlSessionStore } from "./session-store.js";

const tempDirs = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "slms-session-store-"));
  tempDirs.push(dir);
  return dir;
}

function readJsonLines(path) {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("JsonlSessionStore", () => {
  it("creates a session header with stable metadata", () => {
    const store = new JsonlSessionStore({ cwd: "/project", rootDir: tempDir() });
    const info = store.getInfo();
    const lines = readJsonLines(info.sessionFile);

    expect(info.sessionId).toEqual(expect.any(String));
    expect(info.entryCount).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      type: "session",
      version: 1,
      id: info.sessionId,
      cwd: "/project",
    });
  });

  it("appends entries with ids and timestamps", () => {
    const store = new JsonlSessionStore({ cwd: "/project", rootDir: tempDir() });

    store.append({ type: "message", message: { role: "user", content: "hi" } });
    store.append({ type: "tool_call", toolCall: { id: "call_0", name: "bash", args: {} } });

    const lines = readJsonLines(store.getInfo().sessionFile);
    expect(store.getInfo().entryCount).toBe(2);
    expect(lines.slice(1)).toMatchObject([
      { type: "message", message: { role: "user", content: "hi" } },
      { type: "tool_call", toolCall: { id: "call_0", name: "bash", args: {} } },
    ]);
    expect(lines[1].id).toEqual(expect.any(String));
    expect(lines[1].timestamp).toEqual(expect.any(String));
  });

  it("starts a fresh file and metadata on newSession", () => {
    const store = new JsonlSessionStore({ cwd: "/project", rootDir: tempDir() });
    const first = store.getInfo();
    store.append({ type: "message", message: { role: "user", content: "old" } });

    store.newSession();

    const second = store.getInfo();
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.sessionFile).not.toBe(first.sessionFile);
    expect(second.entryCount).toBe(0);
    expect(readJsonLines(second.sessionFile)).toHaveLength(1);
  });
});
