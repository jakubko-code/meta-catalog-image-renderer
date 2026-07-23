import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { PROJECT_ROOT, resolveProjectPath } from "../project-root.js";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveLocalBackgroundPython(environment = process.env) {
  const configured = environment.REMBG_PYTHON?.trim();
  if (configured) return configured;
  const candidate = process.platform === "win32"
    ? resolveProjectPath(path.join(".venv-rembg", "Scripts", "python.exe"))
    : resolveProjectPath(path.join(".venv-rembg", "bin", "python"));
  if (await exists(candidate)) return candidate;
  throw new Error("Lokálne odstránenie pozadia ešte nie je nainštalované. V termináli spusti: npm run setup:u2net");
}

export async function createLocalBackgroundWorker({ environment = process.env } = {}) {
  const python = await resolveLocalBackgroundPython(environment);
  const script = resolveProjectPath(path.join("scripts", "background-removal-worker.py"));
  const modelDirectory = resolveProjectPath(path.join("out", "models", "u2net"));
  await mkdir(modelDirectory, { recursive: true });
  const child = spawn(python, ["-u", script], {
    cwd: PROJECT_ROOT,
    env: {
      ...environment,
      U2NET_HOME: modelDirectory,
      REMBG_CPU_THREADS: environment.REMBG_CPU_THREADS || "2",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const queue = [];
  let nextId = 1;
  let activeRequest = null;
  let stderr = "";
  let closed = false;
  let closing = false;

  const rejectAll = (error) => {
    activeRequest?.reject(error);
    activeRequest = null;
    for (const request of queue.splice(0)) request.reject(error);
  };

  const finishIfClosing = () => {
    if (closing && !activeRequest && queue.length === 0 && child.stdin.writable) {
      child.stdin.end();
    }
  };

  const pump = () => {
    if (activeRequest || closed || queue.length === 0 || !child.stdin.writable) {
      finishIfClosing();
      return;
    }
    activeRequest = queue.shift();
    child.stdin.write(`${JSON.stringify({
      id: activeRequest.id,
      input: activeRequest.inputPath,
      output: activeRequest.outputPath,
      model: activeRequest.model,
    })}\n`, (error) => {
      if (!error) return;
      const request = activeRequest;
      activeRequest = null;
      request.reject(error);
      pump();
    });
  };

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8_000);
  });

  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let response;
    try {
      response = JSON.parse(line);
    } catch {
      return;
    }
    const request = activeRequest;
    if (!request || request.id !== response.id) return;
    activeRequest = null;
    if (response.ok) request.resolve(response);
    else request.reject(new Error(response.error || "Local background worker failed."));
    pump();
  });

  const exitPromise = new Promise((resolve) => {
    child.once("error", (error) => {
      rejectAll(error);
    });
    child.once("close", (code) => {
      const detail = stderr.trim();
      rejectAll(new Error(`Local background worker exited with code ${code}.${detail ? ` ${detail}` : ""}`));
      closed = true;
      resolve();
    });
  });

  return {
    process(inputPath, outputPath, model) {
      if (closed || closing || !child.stdin.writable) {
        return Promise.reject(new Error("Local background worker is closed."));
      }
      const id = nextId++;
      return new Promise((resolve, reject) => {
        queue.push({ id, inputPath, outputPath, model, resolve, reject });
        pump();
      });
    },
    async close() {
      if (closed) return;
      closing = true;
      finishIfClosing();
      await exitPromise;
    },
  };
}
