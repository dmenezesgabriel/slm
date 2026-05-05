import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const SESSION_VERSION = 1;

function defaultRootDir() {
  return join(homedir(), ".slms", "sessions");
}

function safePathSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "root";
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function nowIso() {
  return new Date().toISOString();
}

function entryId() {
  return randomUUID().slice(0, 8);
}

function sessionDir(rootDir, cwd) {
  return join(rootDir, safePathSegment(cwd));
}

function readEntries(sessionFile) {
  return readFileSync(sessionFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function messagesFromEntries(entries) {
  return entries
    .filter((entry) => entry.type === "message" && entry.message)
    .map((entry) => entry.message);
}

export class JsonlSessionStore {
  constructor({ cwd = process.cwd(), rootDir = defaultRootDir() } = {}) {
    this.cwd = cwd;
    this.rootDir = rootDir;
    this.newSession();
  }

  static listSessions({ cwd = process.cwd(), rootDir = defaultRootDir() } = {}) {
    const dir = sessionDir(rootDir, cwd);
    let files;
    try {
      files = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
    } catch (_err) {
      return [];
    }

    return files
      .map((name) => {
        const sessionFile = join(dir, name);
        try {
          const entries = readEntries(sessionFile);
          const header = entries[0];
          return {
            sessionId: header.id,
            sessionFile,
            cwd: header.cwd,
            entryCount: Math.max(0, entries.length - 1),
            updatedAt: statSync(sessionFile).mtimeMs,
          };
        } catch (_err) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  newSession() {
    this.sessionId = randomUUID();
    this.entryCount = 0;

    const dir = sessionDir(this.rootDir, this.cwd);
    mkdirSync(dir, { recursive: true });

    this.sessionFile = join(dir, `${timestampForFile()}_${this.sessionId}.jsonl`);
    this._writeHeader();
  }

  resume(sessionFile) {
    const entries = readEntries(sessionFile);
    const header = entries[0];
    if (!header || header.type !== "session") {
      throw new Error(`Invalid SLMS session file: ${sessionFile}`);
    }

    this.sessionId = header.id;
    this.sessionFile = sessionFile;
    this.cwd = header.cwd ?? this.cwd;
    this.entryCount = Math.max(0, entries.length - 1);

    return messagesFromEntries(entries.slice(1));
  }

  append(entry) {
    const persisted = {
      ...entry,
      id: entry.id ?? entryId(),
      timestamp: entry.timestamp ?? nowIso(),
    };
    appendFileSync(this.sessionFile, JSON.stringify(persisted) + "\n", "utf8");
    this.entryCount += 1;
  }

  getInfo() {
    return {
      sessionId: this.sessionId,
      sessionFile: this.sessionFile,
      cwd: this.cwd,
      entryCount: this.entryCount,
    };
  }

  _writeHeader() {
    const header = {
      type: "session",
      version: SESSION_VERSION,
      id: this.sessionId,
      timestamp: nowIso(),
      cwd: this.cwd,
    };
    writeFileSync(this.sessionFile, JSON.stringify(header) + "\n", "utf8");
  }
}
