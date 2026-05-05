import { readdirSync, statSync, existsSync } from "fs";
import { resolve, dirname, basename, join } from "path";
import { homedir } from "os";

/**
 * Return up to 10 file/directory completions for a partial path.
 * @param {string} partial  e.g. "./src/", "~/Doc", "/usr/loc"
 * @returns {{ label: string, value: string }[]}
 */
export function getFileCompletions(partial) {
  try {
    const expanded  = partial.startsWith("~") ? homedir() + partial.slice(1) : partial;
    const isDir     = expanded.endsWith("/");
    const dir       = isDir ? expanded : dirname(expanded) || ".";
    const prefix    = isDir ? "" : basename(expanded);
    const absDir    = resolve(dir);

    if (!existsSync(absDir)) return [];

    return readdirSync(absDir)
      .filter((e) => e.startsWith(prefix) && !e.startsWith("."))
      .slice(0, 10)
      .map((e) => {
        const full  = join(absDir, e);
        const isD   = (() => { try { return statSync(full).isDirectory(); } catch { return false; } })();
        const suffix = isD ? "/" : "";
        const rel    = (isDir ? expanded : dirname(partial) + "/") + e + suffix;
        return { label: e + suffix, value: rel };
      });
  } catch (_) {
    return [];
  }
}

/**
 * Check whether `value[0..cursor]` ends with a path-like pattern.
 * Returns { start, partial } if found, else null.
 */
export function triggerFileCompletion(value, cursor) {
  const before = value.slice(0, cursor);
  const match  = before.match(/(\.{1,2}\/|~\/|\/)[^\s]*/);
  if (!match) return null;
  return { start: match.index, partial: match[0] };
}
