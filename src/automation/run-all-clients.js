#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { listClientIds, loadClientConfig } from "../config/load-config.js";
import { validateClientConfig } from "../config/validate-config.js";
import { publishCatalog } from "../pipeline/publish-catalog.js";

function parseOptions(arguments_) {
  const options = { force: false, validateOnly: false };
  for (const argument of arguments_) {
    if (argument === "--force") options.force = true;
    else if (argument === "--validate-only") options.validateOnly = true;
    else if (argument.startsWith("--client=")) options.clientId = argument.slice("--client=".length);
    else throw new Error(`Unknown option ${JSON.stringify(argument)}.`);
  }
  return options;
}

function duration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function markdown(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function createSummary(rows, options) {
  const lines = [
    "## Meta catalog publish",
    "",
    `Mode: ${options.validateOnly ? "validation only" : options.force ? "forced publish" : "incremental publish"}`,
    "",
    "| Client | Status | Duration | Eligible | Rendered | Reused | Skipped | Uploaded | Errors |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of rows) {
    lines.push([
      markdown(row.clientId), markdown(row.status), markdown(duration(row.durationMs)),
      markdown(row.eligibleCount), markdown(row.renderedCount), markdown(row.reusedLocalCount),
      markdown(row.skippedCount), markdown(row.uploadedImageCount), markdown(row.errorCount),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
  for (const row of rows.filter((item) => item.message || item.errors?.length)) {
    lines.push("", `<details><summary>${markdown(row.clientId)} details</summary>`, "", "```text");
    if (row.message) lines.push(row.message);
    for (const error of row.errors ?? []) lines.push(`${error.id} [${error.stage}]: ${error.reason}`);
    lines.push("```", "", "</details>");
  }
  return `${lines.join("\n")}\n`;
}

async function validConfig(clientId) {
  const config = await loadClientConfig(clientId);
  const errors = validateClientConfig(config, clientId);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return config;
}

const options = parseOptions(process.argv.slice(2));
const availableClientIds = await listClientIds();
const clientIds = options.clientId ? [options.clientId] : availableClientIds;
if (clientIds.length === 0) throw new Error("No client configurations were found in clients/.");
if (options.clientId && !availableClientIds.includes(options.clientId)) {
  throw new Error(`Client ${JSON.stringify(options.clientId)} was not found in clients/.`);
}

const rows = [];
let hasFailures = false;
for (const clientId of clientIds) {
  const startedAt = Date.now();
  console.log(`\n=== ${clientId} ===`);
  try {
    const config = await validConfig(clientId);
    if (options.validateOnly) {
      console.log(`✓ Configuration ${JSON.stringify(clientId)} is valid.`);
      rows.push({ clientId, status: "VALID", durationMs: Date.now() - startedAt, errorCount: 0 });
      continue;
    }

    const result = await publishCatalog(config, { force: options.force });
    const status = result.errors.length === 0 ? "OK" : "ERRORS";
    console.log(
      `${status === "OK" ? "✓" : "✗"} ${clientId}: ${result.renderedCount} rendered, `
      + `${result.skippedCount} skipped, ${result.uploadedImageCount} uploaded, ${result.errors.length} errors.`,
    );
    rows.push({
      clientId,
      status,
      durationMs: Date.now() - startedAt,
      eligibleCount: result.eligibleCount,
      renderedCount: result.renderedCount,
      reusedLocalCount: result.reusedLocalCount,
      skippedCount: result.skippedCount,
      uploadedImageCount: result.uploadedImageCount,
      errorCount: result.errors.length,
      errors: result.errors,
    });
    if (result.errors.length > 0) hasFailures = true;
  } catch (error) {
    hasFailures = true;
    console.error(`✗ ${clientId}: ${error.message}`);
    rows.push({
      clientId,
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      errorCount: 1,
      message: error.message,
    });
  }
}

const summary = createSummary(rows, options);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, "utf8");
else console.log(`\n${summary}`);
if (hasFailures) process.exitCode = 1;
