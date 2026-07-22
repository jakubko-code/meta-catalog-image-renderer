import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { loadClientConfig } from "../config/load-config.js";
import { validateClientConfig } from "../config/validate-config.js";
import { publishCatalog } from "../pipeline/publish-catalog.js";
import { resolveProjectPath } from "../project-root.js";

const jobs = new Map();
const MAX_RUNS = 100;

async function loadValidConfig(clientId) {
  const config = await loadClientConfig(clientId);
  const errors = validateClientConfig(config, clientId);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return config;
}

export async function loadRuns(clientId) {
  const runsPath = resolveProjectPath(`out/${clientId}/runs.json`);
  try {
    const runs = JSON.parse(await readFile(runsPath, "utf8"));
    return Array.isArray(runs) ? runs : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error(`Run history for ${clientId} cannot be read: ${error.message}`);
  }
}

async function saveRun(clientId, run) {
  const runsPath = resolveProjectPath(`out/${clientId}/runs.json`);
  const runs = await loadRuns(clientId);
  await mkdir(path.dirname(runsPath), { recursive: true });
  const temporaryPath = `${runsPath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify([run, ...runs].slice(0, MAX_RUNS), null, 2)}\n`, "utf8");
  await rename(temporaryPath, runsPath);
}

function publicJob(job) {
  return JSON.parse(JSON.stringify(job));
}

function updateProgress(job, progress) {
  Object.assign(job, progress, { updatedAt: new Date().toISOString() });
}

async function executeJob(job, config, options) {
  job.status = "running";
  job.stage = "loadingRemoteState";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;

  let outcomeStatus;
  try {
    const result = await publishCatalog(config, {
      force: options.force,
      onProgress: (progress) => updateProgress(job, progress),
    });
    outcomeStatus = result.errors.length > 0 ? "completed_with_errors" : "completed";
    job.renderedCount = result.renderedCount;
    job.reusedLocalCount = result.reusedLocalCount;
    job.skippedCount = result.skippedCount;
    job.failedCount = result.errors.length;
    job.uploadedImageCount = result.uploadedImageCount;
    job.errors = result.errors;
  } catch (error) {
    outcomeStatus = "failed";
    job.message = error.message;
    job.failedCount = Math.max(job.failedCount ?? 0, 1);
  } finally {
    job.status = "finalizing";
    job.stage = "savingHistory";
    job.finishedAt = new Date().toISOString();
    job.updatedAt = job.finishedAt;
    job.durationMs = new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime();
    const run = { ...publicJob(job), status: outcomeStatus, stage: outcomeStatus };
    try {
      await saveRun(job.clientId, run);
    } catch (error) {
      job.historyError = error.message;
    }
    job.status = outcomeStatus;
    job.stage = outcomeStatus;
    job.updatedAt = new Date().toISOString();
  }
}

export async function startRenderJob(clientId, options = {}) {
  const current = jobs.get(clientId);
  if (current && ["queued", "running"].includes(current.status)) {
    const error = new Error(`A render for ${clientId} is already running.`);
    error.statusCode = 409;
    throw error;
  }
  const config = await loadValidConfig(clientId);
  const job = {
    id: randomUUID(),
    clientId,
    templateVersion: config.templateVersion,
    status: "queued",
    stage: "queued",
    force: options.force === true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedCount: 0,
    totalCount: 0,
    renderedCount: 0,
    reusedLocalCount: 0,
    skippedCount: 0,
    failedCount: 0,
    uploadedImageCount: 0,
  };
  jobs.set(clientId, job);
  setImmediate(() => executeJob(job, config, options));
  return publicJob(job);
}

export function getRenderJob(clientId) {
  const job = jobs.get(clientId);
  return job ? publicJob(job) : { clientId, status: "idle", stage: "idle" };
}
