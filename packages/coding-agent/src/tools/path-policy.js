import { resolve, relative, isAbsolute } from "path";

export function getDefaultCwd() {
  return process.env.INIT_CWD ?? process.cwd();
}

export function resolveInsideCwd(path, cwd = getDefaultCwd()) {
  const root = resolve(cwd);
  const target = isAbsolute(path) ? resolve(path) : resolve(root, path);
  const rel = relative(root, target);

  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return target;
  }

  throw new Error(`Path is outside the working directory: ${path}`);
}
