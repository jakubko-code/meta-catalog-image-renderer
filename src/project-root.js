import { fileURLToPath } from "node:url";
import path from "node:path";

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

export function resolveProjectPath(relativePath) {
  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  const rootWithSeparator = `${PROJECT_ROOT}${path.sep}`;
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(rootWithSeparator)) {
    throw new Error(`Path escapes the repository root: ${relativePath}`);
  }
  return resolved;
}
