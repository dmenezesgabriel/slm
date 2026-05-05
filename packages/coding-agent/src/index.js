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

import { Agent } from "@slms/core";
import {
  Screen, Renderer,
  Input, Loader, Markdown,
  ansi, strip,
  Autocomplete, SlashCommands,
  getFileCompletions, triggerFileCompletion,
} from "@slms/tui";
import { ReadTool, WriteTool, EditTool, BashTool } from "./tools/index.js";

// ── config ────────────────────────────────────────────────────────────────────

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
  { name: "reset",   description: "Clear conversation and reset model state" },
  { name: "thinking",description: "Toggle thinking mode" },
  { name: "exit",    description: "Exit the agent" },
]);

// ── state ─────────────────────────────────────────────────────────────────────

const history   = [];   // { role, content, meta? } — display history
let   processing = false;
let   streamLine = "";  // token buffer for current streamed response

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
  if (processing) {
    lines.push("  " + ansi.style.dim + "Processing…" + ansi.style.reset);
  } else {
    lines.push(input.render(W)[0] ?? "");
  }
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
  tools:   [new ReadTool(), new WriteTool(), new EditTool(), new BashTool()],
  onToken(token) {
    streamLine += token;
    render();
  },
  onStep({ reply }) {
    // Record tool calls so they appear in the conversation while processing
    if (reply.tool_calls?.length) {
      for (const call of reply.tool_calls) {
        const args = (() => {
          try { return JSON.parse(call.function.arguments); } catch { return {}; }
        })();
        history.push({ role: "tool_call", content: "", meta: { name: call.function.name, args } });
      }
    }
  },
});



async function runQuery(query) {
  if (!query.trim()) return;

  history.push({ role: "user", content: query });
  processing = true;
  streamLine = "";
  render();

  try {
    const answer = await agent.run(query);

    // Fold any tool results that were added during onStep
    // Then add the final assistant answer
    streamLine = "";
    history.push({ role: "assistant", content: answer });
  } catch (err) {
    streamLine = "";
    history.push({ role: "error", content: err.message });
  } finally {
    processing = false;
    render();
  }
}

// ── slash command handler ─────────────────────────────────────────────────────

function handleSlash(cmd) {
  const [name, ...rest] = cmd.trim().slice(1).split(/\s+/);
  switch (name) {
    case "help":
      history.push({ role: "info", content: "Commands: /help  /clear  /reset  /thinking  /exit" });
      break;
    case "clear":
      history.length = 0;
      renderer.forceFullRender();
      break;
    case "reset":
      history.length = 0;
      // Agent keeps conversation state in run() — each run() call starts fresh.
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
  if (processing) {
    // Only allow Ctrl-C during processing
    if (key.name === "ctrl-c") { screen.stop(); process.exit(0); }
    return;
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

    if (key.name === "return" && !processing) {
      const val = input.value.trim();
      acList.hide();
      input.clear();
      if (val.startsWith("/")) handleSlash(val);
      else runQuery(val);
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
    content: `Model: ${CONFIG.model}  dtype: ${CONFIG.dtype}  device: ${CONFIG.device}`,
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
