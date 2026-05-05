import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { ReadTool, WriteTool, EditTool } from "./index.js";

const tempDirs = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "slms-file-tools-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("file tools cwd policy", () => {
  it("read/write/edit reject paths outside cwd", async () => {
    const cwd = tempDir();
    const outside = join(tempDir(), "outside.txt");

    await expect(new ReadTool({ cwd }).runWithResult({ path: outside })).resolves.toMatchObject({ isError: true });
    await expect(new WriteTool({ cwd }).runWithResult({ path: outside, content: "x" })).resolves.toMatchObject({ isError: true });
    await expect(new EditTool({ cwd }).runWithResult({ path: outside, oldText: "x", newText: "y" })).resolves.toMatchObject({ isError: true });
  });

  it("write creates parent directories inside cwd", async () => {
    const cwd = tempDir();
    const result = await new WriteTool({ cwd }).runWithResult({ path: "nested/hello.py", content: "print('hi')\n" });

    expect(result.isError).toBe(false);
    expect(readFileSync(join(cwd, "nested/hello.py"), "utf8")).toBe("print('hi')\n");
  });
});

describe("EditTool", () => {
  it("applies multiple exact replacements based on the original file", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "app.js"), "const a = 1;\nconst b = 2;\n", "utf8");

    const result = await new EditTool({ cwd }).runWithResult({
      path: "app.js",
      edits: [
        { oldText: "const a = 1;", newText: "const a = 10;" },
        { oldText: "const b = 2;", newText: "const b = 20;" },
      ],
    });

    expect(result.isError).toBe(false);
    expect(readFileSync(join(cwd, "app.js"), "utf8")).toBe("const a = 10;\nconst b = 20;\n");
  });

  it("rejects missing, duplicate, and overlapping replacements", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "app.js"), "repeat\nrepeat\nabcdef\n", "utf8");
    const tool = new EditTool({ cwd });

    await expect(tool.runWithResult({
      path: "app.js",
      edits: [{ oldText: "missing", newText: "x" }],
    })).resolves.toMatchObject({ isError: true, content: expect.stringContaining("not found") });

    await expect(tool.runWithResult({
      path: "app.js",
      edits: [{ oldText: "repeat", newText: "x" }],
    })).resolves.toMatchObject({ isError: true, content: expect.stringContaining("appears 2 times") });

    await expect(tool.runWithResult({
      path: "app.js",
      edits: [
        { oldText: "abc", newText: "x" },
        { oldText: "bc", newText: "y" },
      ],
    })).resolves.toMatchObject({ isError: true, content: expect.stringContaining("overlap") });
  });
});
