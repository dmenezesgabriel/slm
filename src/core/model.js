/**
 * src/core/model.js
 *
 * Singleton pipeline loader with:
 *   - download progress reporting (per-file + aggregate %)
 *   - TextStreamer for token-by-token stdout output
 *   - device / dtype config (cpu = Node default, webgpu = browser/Node GPU)
 *
 * This file has zero framework deps — only @huggingface/transformers.
 * It works identically in Node.js and the browser; the only change for
 * browser use is swapping `process.stderr.write` for a UI callback
 * (see BROWSER_NOTES at the bottom).
 */

// ── progress reporter ──────────────────────────────────────────────────────────

function makeProgressCallback(onProgress) {
  const files = new Map();
  let lastLineLen = 0;

  const isTTY = typeof process !== "undefined" && process.stderr?.isTTY;

  const clearLine = () => {
    if (isTTY && lastLineLen > 0) {
      process.stderr.write(`\r${" ".repeat(lastLineLen)}\r`);
      lastLineLen = 0;
    }
  };

  const writeln = (line) => {
    clearLine();
    if (typeof process !== "undefined") {
      process.stderr.write(line + "\n");
    }
    onProgress?.({ type: "log", message: line });
  };

  const writeLine = (line) => {
    if (isTTY) {
      clearLine();
      process.stderr.write(line);
      lastLineLen = line.length;
    } else {
      // Non-TTY Node or browser — just emit the event, skip ANSI tricks
      onProgress?.({ type: "progress_line", message: line });
    }
  };

  return (event) => {
    const { status, name, file, loaded, total } = event;

    if (status === "initiate") {
      const label = (file ?? name ?? "").split("/").pop();
      files.set(file ?? name ?? "?", { loaded: 0, total: 0 });
      writeln(`[model] queued    ${label}`);
      return;
    }

    if (status === "progress") {
      const key = file ?? name ?? "?";
      files.set(key, { loaded: loaded ?? 0, total: total ?? 0 });

      let aggLoaded = 0, aggTotal = 0;
      for (const f of files.values()) { aggLoaded += f.loaded; aggTotal += f.total; }

      const pct     = aggTotal > 0 ? ((aggLoaded / aggTotal) * 100).toFixed(1) : "?  ";
      const mb      = (aggLoaded / 1048576).toFixed(1);
      const totalMb = aggTotal > 0 ? (aggTotal / 1048576).toFixed(1) : "?";
      const label   = (file ?? name ?? "").split("/").pop().slice(0, 36);

      onProgress?.({ type: "progress", loaded: aggLoaded, total: aggTotal });
      writeLine(`[model] ${pct.padStart(5)}%  ${mb} / ${totalMb} MB   ${label}`);
      return;
    }

    if (status === "done") {
      const label = (file ?? name ?? "").split("/").pop();
      writeln(`[model] cached    ${label}`);
      return;
    }

    if (status === "ready") {
      writeln("[model] ready ✓");
      onProgress?.({ type: "ready" });
    }
  };
}

// ── singleton ──────────────────────────────────────────────────────────────────

let _pipe = null;

/**
 * Load (or return cached) the text-generation pipeline.
 *
 * @param {object} opts
 * @param {string}   opts.model      HF model id
 * @param {string}   opts.dtype      e.g. "q4", "q4f16", "fp32"
 * @param {string}   opts.device     "cpu" | "webgpu"
 * @param {string}   [opts.cacheDir] local cache dir (Node only)
 * @param {Function} [opts.onProgress] called with progress events
 */
export async function loadModel({ model, dtype, device, cacheDir, onProgress } = {}) {
  if (_pipe) return _pipe;

  const { pipeline, env, TextStreamer } = await import("@huggingface/transformers");

  if (cacheDir && env.cacheDir !== undefined) env.cacheDir = cacheDir;

  if (typeof process !== "undefined") {
    process.stderr.write(`[model] loading  ${model}\n`);
    process.stderr.write(`[model] dtype    ${dtype}   device  ${device}\n`);
  }

  try {
    _pipe = await pipeline("text-generation", model, {
      dtype,
      device,
      progress_callback: makeProgressCallback(onProgress),
    });
  } catch (err) {
    _pipe = null;   // reset so the next call can retry
    throw err;
  }

  return _pipe;
}

/** Reset the singleton (useful in tests). */
export function resetModel() { _pipe = null; }

/*
 * BROWSER_NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 * To use this file in a browser:
 *
 *  1. Pass `onProgress` to loadModel() and wire it to your UI instead of
 *     stderr.  The `writeln` / `writeLine` calls already guard on
 *     `typeof process !== "undefined"`.
 *
 *  2. Run loadModel() inside a Web Worker to keep the main thread unblocked:
 *
 *       // worker.js
 *       import { loadModel } from "./core/model.js";
 *       self.onmessage = async (e) => {
 *         const pipe = await loadModel({ ...e.data.config,
 *           onProgress: (ev) => self.postMessage({ type: "progress", ev }) });
 *         // ... run inference, postMessage results back
 *       };
 *
 *  3. Set device: "webgpu" for GPU-accelerated inference in Chrome/Firefox.
 *     Fall back to "cpu" on unsupported browsers.
 */
