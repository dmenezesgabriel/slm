/**
 * src/core/model.js
 *
 * Singleton pipeline loader with:
 *   - download progress reporting (per-file + aggregate %)
 *   - ONNX inter/intra-op thread capping (prevents VM freeze on low-RAM machines)
 *   - device / dtype config (cpu = Node default, webgpu = browser/Node GPU)
 *
 * Zero framework deps — only @huggingface/transformers.
 * Works identically in Node.js and browser (stderr writes are guarded).
 */

// ── progress reporter ──────────────────────────────────────────────────────────

function makeProgressCallback(onProgress) {
  // Map clears itself on "ready" to avoid holding file metadata indefinitely.
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
    if (typeof process !== "undefined") process.stderr.write(line + "\n");
    onProgress?.({ type: "log", message: line });
  };

  const writeLine = (line) => {
    if (isTTY) {
      clearLine();
      process.stderr.write(line);
      lastLineLen = line.length;
    } else {
      onProgress?.({ type: "progress_line", message: line });
    }
  };

  return (event) => {
    const { status, name, file, loaded, total } = event;
    const key   = file ?? name ?? "?";
    const label = key.split("/").pop();

    if (status === "initiate") {
      files.set(key, { loaded: 0, total: 0 });
      writeln(`[model] queued    ${label}`);
      return;
    }

    if (status === "progress") {
      files.set(key, { loaded: loaded ?? 0, total: total ?? 0 });

      let aggLoaded = 0, aggTotal = 0;
      for (const f of files.values()) { aggLoaded += f.loaded; aggTotal += f.total; }

      const pct     = aggTotal > 0 ? ((aggLoaded / aggTotal) * 100).toFixed(1) : "?  ";
      const mb      = (aggLoaded / 1048576).toFixed(1);
      const totalMb = aggTotal > 0 ? (aggTotal / 1048576).toFixed(1) : "?";

      onProgress?.({ type: "progress", loaded: aggLoaded, total: aggTotal });
      writeLine(`[model] ${pct.padStart(5)}%  ${mb} / ${totalMb} MB   ${label.slice(0, 36)}`);
      return;
    }

    if (status === "done") {
      files.delete(key);   // ← release entry immediately, don't accumulate
      writeln(`[model] cached    ${label}`);
      return;
    }

    if (status === "ready") {
      files.clear();       // ← clear anything remaining
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
 * @param {string}   opts.model       HF model id
 * @param {string}   opts.dtype       "q4" | "q4f16" | "fp32"
 * @param {string}   opts.device      "cpu" | "webgpu"
 * @param {string}   [opts.cacheDir]  local cache dir (Node only)
 * @param {number}   [opts.threads]   ONNX CPU thread count (default: 2)
 * @param {Function} [opts.onProgress]
 */
export async function loadModel({
  model,
  dtype,
  device,
  cacheDir,
  threads = 2,       // ← cap threads to prevent VM freeze on 8 GB machines
  onProgress,
} = {}) {
  if (_pipe) return _pipe;

  const { pipeline, env } = await import("@huggingface/transformers");

  if (cacheDir && env.cacheDir !== undefined) env.cacheDir = cacheDir;

  // Cap ONNX CPU threads.
  // Default is "all logical cores" which on Crostini competes with ChromeOS
  // for the same RAM and can trigger the OOM killer / kernel freeze.
  // 2 threads keeps RSS predictable while staying responsive.
  if (device === "cpu" && env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = threads;
  }

  if (typeof process !== "undefined") {
    process.stderr.write(`[model] loading  ${model}\n`);
    process.stderr.write(`[model] dtype    ${dtype}   device  ${device}   threads  ${threads}\n`);
  }

  try {
    _pipe = await pipeline("text-generation", model, {
      dtype,
      device,
      progress_callback: makeProgressCallback(onProgress),
    });
  } catch (err) {
    _pipe = null;
    throw err;
  }

  return _pipe;
}

/** Reset the singleton (useful in tests or when switching models). */
export function resetModel() { _pipe = null; }

/*
 * BROWSER_NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Pass `onProgress` to loadModel() to wire progress to your UI.
 * 2. Run loadModel() inside a Web Worker to keep the main thread unblocked.
 * 3. Use device: "webgpu" + dtype: "q4f16" for GPU inference in Chrome/Firefox.
 * 4. The `threads` option has no effect with device: "webgpu".
 */
