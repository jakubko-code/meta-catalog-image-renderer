import { spawnSync } from "node:child_process";
import { accessSync } from "node:fs";
import path from "node:path";

import { PROJECT_ROOT } from "../src/project-root.js";

const virtualEnvironment = path.join(PROJECT_ROOT, ".venv-rembg");
const virtualPython = process.platform === "win32"
  ? path.join(virtualEnvironment, "Scripts", "python.exe")
  : path.join(virtualEnvironment, "bin", "python");

function commandWorks(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: PROJECT_ROOT, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  accessSync(virtualPython);
} catch {
  const python = process.platform === "win32" && commandWorks("py", ["-3", "--version"])
    ? { command: "py", args: ["-3"] }
    : commandWorks("python3")
      ? { command: "python3", args: [] }
      : commandWorks("python")
        ? { command: "python", args: [] }
        : null;
  if (!python) throw new Error("Python 3.11–3.13 nebol nájdený. Nainštaluj Python a spusti príkaz znova.");
  run(python.command, [...python.args, "-m", "venv", virtualEnvironment]);
}

run(virtualPython, ["-m", "pip", "install", "--upgrade", "pip"]);
run(virtualPython, ["-m", "pip", "install", "rembg[cpu]==2.0.75"]);
console.log("U²-Net je pripravený. Model sa automaticky stiahne pri prvom použití.");
