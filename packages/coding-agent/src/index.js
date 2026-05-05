#!/usr/bin/env node
/**
 * @slms/coding-agent — interactive coding agent with a TUI.
 *
 * Usage:
 *   coding-agent                   # interactive TUI
 *   coding-agent "fix the bug"     # one-shot, prints answer and exits
 *
 * Env vars (all optional):
 *   MODEL           HF model id          (default: onnx-community/Qwen3-0.6B-ONNX)
 *   DTYPE           quantisation         (default: q4)
 *   DEVICE          cpu | webgpu         (default: cpu)
 *   CACHE_DIR       model cache path     (default: ~/.transformers-js/.cache)
 *   MAX_NEW_TOKENS  answer token budget  (default: 1024)
 *   THREADS         ONNX CPU threads     (default: 2)
 *   ENABLE_THINKING true | false         (default: false)
 *   THINKING_BUDGET extra thinking tokens(default: 512)
 */

import { Agent, AgentSession } from "@slms/core";
import {
  Screen, Renderer,
  Input, Loader, Markdown, SelectList,
  ansi, strip,
  Autocomplete, SlashCommands,
  getFileCompletions, triggerFileCompletion,
} from "@slms/tui";
import { ReadTool, WriteTool, EditTool, BashTool } from "./tools/index.js";
import { getCodingAgentSystemPrompt } from "./prompt.js";
import { JsonlSessionStore } from "./session-store.js";

// ── config ────────────────────────────────────────────────────────────────────

const WORKING_DIR = process.env.INIT_CWD ?? process.cwd();

const CONFIG = {
  model:          process.env.MODEL            ?? "onnx-community/Qwen3-0.6B-ONNX",
  dtype:          process.env.DTYPE            ?? "q4",
  device:         process.env.DEVICE           ?? "cpu",
  cacheDir:       process.env.CACHE_DIR,        // undefined → ~/.transformers-js/.cache
  maxNewTokens:   Number(process.env.MAX_NEW_TOKENS   ?? 1024),
  threads:        Number(process.env.THREADS          ?? 2),
  enableThinking: process.env.ENABLE_THINKING  === "true",
  thinkingBudget: Number(process.env.THINKING_BUDGET  ?? 512),
};

// ── slash commands ─────────────────────────────────────────────────────────────

const slashCmds = new SlashCommands([
  { name: "help",    description: "Show available commands" },
  { name: "clear",   description: "Clear the conversation" },
  { name: "new",     description: "Start a new persisted session" },
  { name: "session", description: "Show current session info" },
  { name: "reset",   description: "Clear conversation and reset model state" },
  { name: "thinking",description: "Toggle thinking mode" },
  { name: "exit",    description: "Exit the agent" },
]);

// ── state ─────────────────────────────────────────────────────────────────────

const history   = [];   // { role, content, meta? } — display history
let   processing = false;
let   streamLine = "";  // token buffer for current streamed response
let   resumeSelector = null;
let   session = null;

// ── TUI setup ─────────────────────────────────────────────────────────────────

const screen    = new Screen();
const renderer  = new Renderer(screen.output);
const input     = new Input({ prefix: "  › ", placeholder: "Ask anything  (/help for commands)" });
const loader    = new Loader("Thinking…");
const acList    = new Autocomplete();

// ── rendering ─────────────────────────────────────────────────────────────────

function buildFrame(width, height) {
  const W = Math.max(20, width);

  // Layout (rows):
  //   1          ─ header
  //   convHeight ─ conversation  (anchored to top, empty rows pad bottom)
  //   acRows     ─ autocomplete overlay
  //   1          ─ blank padding   ← breathing room above separator
  //   1          ─ separator
  //   1          ─ input / processing indicator
  //   1          ─ status bar (model info)   ← NEW, replaces terminal-edge glue
  // total = 1 + convHeight + acRows + 6 = height

  const BOTTOM = 6; // blank + sep + input + sep + status + empty line

  const maxAC  = Math.max(0, Math.floor((height - 1 - BOTTOM) / 2));
  const acRows = (acList.visible && !processing)
    ? Math.min(acList.items.length, maxAC, 5)
    : 0;

  const convHeight = Math.max(0, height - 1 - BOTTOM - acRows);

  const lines = [];

  // ── header ────────────────────────────────────────────────────────
  const fullTitle  = ` SLMS Coding Agent  ${CONFIG.model} `;
  const shortTitle = ` SLMS Coding Agent `;
  const titleStr   = strip(fullTitle).length + 2 <= W ? fullTitle : shortTitle;
  const hFill      = "─".repeat(Math.max(0, W - strip(titleStr).length - 2));
  lines.push(ansi.color.brightCyan + "─" + titleStr + hFill + "─" + ansi.style.reset);

  // ── conversation ──────────────────────────────────────────────
  const convLines = [];
  for (const msg of history) convLines.push(...renderMessage(msg, W));
  if (resumeSelector) {
    convLines.push(...resumeSelector.render(W));
    convLines.push(ansi.style.dim + "  Enter: resume  Esc: cancel" + ansi.style.reset);
    convLines.push("");
  }

  if (session) {
    const queued = session.queuedMessages;
    if (queued.steer.length || queued.followUp.length) {
      for (const text of queued.steer) {
        convLines.push(ansi.color.yellow + "  queued steer  " + ansi.style.reset + ansi.style.dim + text + ansi.style.reset);
      }
      for (const text of queued.followUp) {
        convLines.push(ansi.color.yellow + "  queued follow-up  " + ansi.style.reset + ansi.style.dim + text + ansi.style.reset);
      }
      convLines.push("");
    }
  }

  if (processing) {
    convLines.push(
      ...(streamLine ? renderStreamingLine(streamLine, W) : loader.render(W)),
    );
  }

  if (convHeight > 0) {
    const clip = convLines.length > convHeight
      ? convLines.slice(-convHeight)
      : convLines;
    lines.push(...clip);
    for (let i = clip.length; i < convHeight; i++) lines.push("");
  }

  // ── autocomplete overlay ─────────────────────────────────────
  if (acRows > 0) {
    const acRendered = acList.render(W);
    for (let i = 0; i < acRows; i++) lines.push(acRendered[i] ?? "");
  }

  // ── bottom: blank + separator + input + status bar ───────────────
  lines.push("");
  lines.push(ansi.color.gray + "─".repeat(W) + ansi.style.reset);
  lines.push(input.render(W)[0] ?? "");
  lines.push(ansi.color.gray + "─".repeat(W) + ansi.style.reset); // sep below input
  lines.push(renderStatusBar(W));
  lines.push("");  // empty row so status bar is not glued to terminal edge

  while (lines.length < height) lines.push("");
  return lines.slice(0, height);
}

function renderStatusBar(width) {
  const parts = [
    CONFIG.model,
    CONFIG.dtype,
    CONFIG.device,
    `${CONFIG.threads}t`,
    `thinking:${agent.enableThinking ? "on" : "off"}`,
  ];
  const text = parts.join("  ·  ");
  const bar  = strip(text).length <= width - 2
    ? text
    : strip(text).slice(0, width - 3) + "…";
  return ansi.style.dim + " " + bar + ansi.style.reset;
}



function renderMessage({ role, content, meta }, width) {
  const out = [];
  if (role === "user") {
    const prefix = ansi.color.brightGreen + ansi.style.bold + "You" + ansi.style.reset + "  ";
    for (const l of wrapWithPrefix(content, width, "You  ", "     "))
      out.push(l);
    out.push("");
  } else if (role === "assistant") {
    const mdLines = new Markdown(content).render(width - 2);
    const pfx = ansi.color.brightBlue + ansi.style.bold + "Agent" + ansi.style.reset + "  ";
    out.push(pfx + (mdLines[0] ?? ""));
    for (let i = 1; i < mdLines.length; i++) out.push("       " + mdLines[i]);
    out.push("");
  } else if (role === "tool_call") {
    // meta = { name, args }
    const argStr = JSON.stringify(meta.args ?? {});
    const line   = ansi.color.yellow + "  ⚙ " + meta.name + ansi.style.reset
                 + ansi.style.dim + "  " + argStr.slice(0, width - meta.name.length - 10) + ansi.style.reset;
    out.push(line);
  } else if (role === "tool_result") {
    // meta = { name }
    const resultLines = content.split("\n").slice(0, 6);
    const more        = content.split("\n").length - 6;
    for (const l of resultLines)
      out.push(ansi.color.gray + "  │ " + ansi.style.reset + ansi.style.dim + l.slice(0, width - 6) + ansi.style.reset);
    if (more > 0)
      out.push(ansi.color.gray + "  │ " + ansi.style.dim + `… ${more} more lines` + ansi.style.reset);
    out.push("");
  } else if (role === "error") {
    out.push(ansi.color.brightRed + "  ✗ " + content + ansi.style.reset);
    out.push("");
  } else if (role === "info") {
    out.push(ansi.color.gray + "  " + content + ansi.style.reset);
    out.push("");
  }
  return out;
}

function renderStreamingLine(text, width) {
  const plain = strip(text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim());
  const inner  = width - 7; // "Agent  " prefix = 7 chars
  const pfx    = ansi.color.brightBlue + ansi.style.bold + "Agent" + ansi.style.reset + "  ";
  const wrapped = plain.length === 0 ? [""] : [];
  let remaining = plain;
  while (remaining.length > 0) {
    wrapped.push(remaining.slice(0, inner));
    remaining = remaining.slice(inner);
  }
  return wrapped.map((l, i) => (i === 0 ? pfx + l : "       " + l));
}



function wrapWithPrefix(text, width, firstPrefix, restPrefix) {
  const lines = [];
  const words = text.split(" ");
  let cur = firstPrefix;
  for (const w of words) {
    if (strip(cur).length + w.length + 1 > width && cur !== firstPrefix) {
      lines.push(cur);
      cur = restPrefix + w;
    } else {
      cur += (cur === firstPrefix ? "" : " ") + w;
    }
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => {
    if (i === 0) {
      const rest = l.slice(firstPrefix.length);
      return ansi.color.brightGreen + ansi.style.bold + "You" + ansi.style.reset + "  " + rest;
    }
    return l;
  });
}

function render(hints = {}) {
  const frame = buildFrame(screen.width, screen.height);
  renderer.render(frame, hints);
}

// ── agent ─────────────────────────────────────────────────────────────────────

const agent = new Agent({
  ...CONFIG,
  verbose: false,   // TUI owns all output; agent verbose logs write to stdout
                    // and corrupt the terminal rendering.
  stream:  true,
  systemPrompt: getCodingAgentSystemPrompt(),
  tools:   [
    new ReadTool({ cwd: WORKING_DIR }),
    new WriteTool({ cwd: WORKING_DIR }),
    new EditTool({ cwd: WORKING_DIR }),
    new BashTool({ cwd: WORKING_DIR }),
  ],
});

const sessionStore = new JsonlSessionStore({ cwd: WORKING_DIR });
const pendingToolCalls = new Map();
let unsubscribeSession = null;

function bindSession(restoredMessages = []) {
  unsubscribeSession?.();
  const messages = [
    { role: "system", content: agent.systemPrompt },
    ...restoredMessages,
  ];
  session = new AgentSession({ agent, store: sessionStore, messages });
  unsubscribeSession = session.subscribe(handleSessionEvent);
}

function handleSessionEvent(event) {
  if (event.type === "message") {
    if (event.message.role === "user") {
      history.push({ role: "user", content: event.message.content });
    } else if (event.message.role === "assistant") {
      streamLine = "";
      if (!event.message.tool_calls?.length) {
        history.push({ role: "assistant", content: event.message.content });
      }
    }
    render();
    return;
  }

  if (event.type === "token") {
    streamLine += event.token;
    render();
    return;
  }

  if (event.type === "tool_call") {
    pendingToolCalls.set(event.id, event.name);
    if (event.name !== "final_answer") {
      history.push({ role: "tool_call", content: "", meta: { name: event.name, args: event.args } });
      render();
    }
    return;
  }

  if (event.type === "tool_result") {
    const name = pendingToolCalls.get(event.id) ?? event.name ?? "tool";
    pendingToolCalls.delete(event.id);
    if (name !== "final_answer") {
      history.push({ role: "tool_result", content: event.result, meta: { name } });
      render();
    }
    return;
  }

  if (event.type === "queued_message" || event.type === "queue_update") {
    render();
    return;
  }

  if (event.type === "aborted") {
    streamLine = "";
    history.push({ role: "info", content: "Aborted current agent run. Queued messages are preserved." });
    render();
    return;
  }

  if (event.type === "error") {
    streamLine = "";
    if (event.error.name !== "AbortError") {
      history.push({ role: "error", content: event.error.message });
    }
    render();
  }
}

bindSession();



function resumeSession(sessionFile) {
  const restoredMessages = sessionStore.resume(sessionFile);
  pendingToolCalls.clear();
  history.length = 0;
  bindSession(restoredMessages);

  for (const message of session.visibleMessages) {
    if (message.role === "user") {
      history.push({ role: "user", content: message.content });
    } else if (message.role === "assistant" && !message.tool_calls?.length) {
      history.push({ role: "assistant", content: message.content });
    } else if (message.role === "tool") {
      history.push({ role: "tool_result", content: message.content, meta: { name: "tool" } });
    }
  }

  history.push({ role: "info", content: `Resumed session: ${sessionStore.getInfo().sessionId}` });
  renderer.forceFullRender();
}

async function runQuery(query) {
  if (!query.trim()) return;

  processing = true;
  streamLine = "";
  render();

  try {
    await session.prompt(query);
  } catch (_err) {
    // AgentSession emits the error event consumed above; keep runQuery settled
    // so fire-and-forget key handling does not create an unhandled rejection.
  } finally {
    processing = false;
    streamLine = "";
    render();
  }
}

// ── slash command handler ─────────────────────────────────────────────────────

function handleSlash(cmd) {
  const [name, ...rest] = cmd.trim().slice(1).split(/\s+/);
  switch (name) {
    case "help":
      history.push({ role: "info", content: "Commands: /help  /clear  /new  /resume  /session  /reset  /thinking  /exit" });
      break;
    case "clear":
      history.length = 0;
      session.reset();
      renderer.forceFullRender();
      break;
    case "new":
      sessionStore.newSession();
      pendingToolCalls.clear();
      history.length = 0;
      bindSession();
      history.push({ role: "info", content: `New session: ${sessionStore.getInfo().sessionId}` });
      renderer.forceFullRender();
      break;
    case "resume": {
      const sessions = JsonlSessionStore
        .listSessions({ cwd: WORKING_DIR })
        .filter((s) => s.sessionFile !== sessionStore.getInfo().sessionFile);
      if (sessions.length === 0) {
        history.push({ role: "info", content: "No saved sessions found." });
        break;
      }
      resumeSelector = new SelectList(sessions.map((s) => ({
        label: `${s.sessionId.slice(0, 8)}  ${s.entryCount} entries  ${s.sessionFile}`,
        value: s.sessionFile,
      })), { maxRows: 8 });
      resumeSelector.on("select", (item) => {
        resumeSelector = null;
        resumeSession(item.value);
        render();
      });
      break;
    }
    case "session": {
      const info = sessionStore.getInfo();
      history.push({
        role: "info",
        content: `Session: ${info.sessionId}\nFile: ${info.sessionFile}\nMessages/events: ${info.entryCount}`,
      });
      break;
    }
    case "reset":
      history.length = 0;
      session.reset();
      history.push({ role: "info", content: "Conversation cleared." });
      break;
    case "thinking":
      agent.enableThinking = !agent.enableThinking;
      history.push({ role: "info", content: `Thinking mode: ${agent.enableThinking ? "ON" : "OFF"}` });
      break;
    case "exit":
      screen.stop();
      process.exit(0);
      break;
    default:
      history.push({ role: "error", content: `Unknown command: /${name}` });
  }
  render();
}

// ── paste handler ─────────────────────────────────────────────────────────────

screen.on("paste", ({ text, lines, large }) => {
  if (large) {
    // For pastes >10 lines, show a confirmation instead of dumping raw text
    history.push({
      role: "info",
      content: `Paste detected: ${lines.length} lines. Inserted into input.`,
    });
    input.insert(text);
  } else {
    input.insert(text);
  }
  render({ inlineRow: screen.height - 1 });
});

// ── key handler ──────────────────────────────────────────────────────────────

screen.on("key", (key) => {
  if (processing && (key.name === "ctrl-c" || key.name === "escape")) {
    session.abort();
    return;
  }

  if (resumeSelector) {
    if (key.name === "escape" || key.name === "ctrl-c") {
      resumeSelector = null;
      render();
      return;
    }
    if (resumeSelector.handleKey(key)) {
      render();
      return;
    }
  }

  // Autocomplete takes priority
  if (acList.visible) {
    const result = acList.handleKey(key);
    if (result && typeof result === "object") {
      // User confirmed a suggestion
      const trigger = triggerFileCompletion(input.value, input.cursor);
      if (trigger) {
        input.value  = input.value.slice(0, trigger.start) + result.value
                     + input.value.slice(input.cursor);
        input.cursor = trigger.start + result.value.length;
      } else {
        input.value  = result.value;
        input.cursor = result.value.length;
      }
      acList.hide();
      render({ inlineRow: screen.height - 1 });
      return;
    }
    if (result !== false) { render(); return; }
    // result === false → not handled, fall through to input
  }

  if (key.name === "ctrl-c" || key.name === "ctrl-d") {
    screen.stop(); process.exit(0);
  }

  const handled = input.handleKey(key);
  if (handled) {
    // Update autocomplete suggestions on every keystroke
    const val = input.value;
    if (val.startsWith("/")) {
      acList.show(slashCmds.getCompletions(val));
    } else {
      const fp = triggerFileCompletion(val, input.cursor);
      acList.show(fp ? getFileCompletions(fp.partial) : []);
    }

    if (key.name === "return") {
      const val = input.value.trim();
      acList.hide();
      input.clear();
      if (processing) {
        if (val) session.steer(val);
      } else if (val.startsWith("/")) {
        handleSlash(val);
      } else {
        runQuery(val);
      }
    } else {
      // Inline strategy for single-line edits (no full redraw needed)
      render({ inlineRow: screen.height - 1 });
    }
  }
});

screen.on("resize", () => {
  renderer.forceFullRender();
  render();
});

// ── model loading + start ─────────────────────────────────────────────────────

async function main() {
  // Model loads before entering TUI so progress goes to stderr cleanly
  process.stderr.write(`Loading ${CONFIG.model}…\n`);
  await agent.load();
  process.stderr.write("Model ready.\n");

  screen.start();
  loader.start(() => { if (processing) render(); });

  // Show startup info
  history.push({
    role: "info",
    content: `Model: ${CONFIG.model}  dtype: ${CONFIG.dtype}  device: ${CONFIG.device}\nCwd: ${WORKING_DIR}\nSession: ${sessionStore.getInfo().sessionId}`,
  });

  const oneShot = process.argv[2];
  if (oneShot) {
    // Non-interactive: run query, print answer, exit
    const answer = await agent.run(oneShot);
    screen.stop();
    console.log(answer);
    process.exit(0);
  }

  render();
}

main().catch((err) => {
  screen.stop();
  console.error("Fatal:", err.message);
  process.exit(1);
});
