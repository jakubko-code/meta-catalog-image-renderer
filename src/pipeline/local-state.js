import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadLocalState(statePath, clientId) {
  let source;
  try {
    source = await readFile(statePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, clientId, products: {} };
    throw error;
  }

  let state;
  try {
    state = JSON.parse(source);
  } catch (error) {
    throw new Error(`Local state ${statePath} contains invalid JSON: ${error.message}`);
  }

  if (state.version !== 1 || state.clientId !== clientId || !state.products || typeof state.products !== "object") {
    throw new Error(`Local state ${statePath} has an unsupported structure.`);
  }
  return state;
}

export async function saveLocalState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, statePath);
}
