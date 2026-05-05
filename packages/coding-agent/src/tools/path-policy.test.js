import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInsideCwd } from "./path-policy.js";

const tempDirs = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "slms-path-policy-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("path policy", () => {
  it("resolves relative paths inside cwd", () => {
    const cwd = tempDir();

    expect(resolveInsideCwd("src/hello.py", cwd)).toBe(join(cwd, "src/hello.py"));
  });

  it("rejects paths outside cwd", () => {
    const cwd = tempDir();

    expect(() => resolveInsideCwd("../outside.txt", cwd)).toThrow(/outside the working directory/);
    expect(() => resolveInsideCwd("/etc/passwd", cwd)).toThrow(/outside the working directory/);
  });
});
