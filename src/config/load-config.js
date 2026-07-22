import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateClientConfig } from "./validate-config.js";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLIENT_ID = /^[a-z0-9][a-z0-9-]*$/;

export async function loadClientConfig(clientId) {
  if (!CLIENT_ID.test(clientId ?? "")) {
    throw new Error("Client name may only contain lowercase letters, numbers and hyphens.");
  }

  const configPath = path.join(PROJECT_ROOT, "clients", `${clientId}.json`);
  let source;

  try {
    source = await readFile(configPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Configuration for client ${JSON.stringify(clientId)} was not found at clients/${clientId}.json.`);
    }
    throw error;
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`clients/${clientId}.json contains invalid JSON: ${error.message}`);
  }
}

export async function listClientIds() {
  const entries = await readdir(path.join(PROJECT_ROOT, "clients"), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.basename(entry.name, ".json"))
    .filter((clientId) => CLIENT_ID.test(clientId))
    .sort();
}

export async function saveClientTemplate(clientId, { template, brand, templateVariants, templateRules }) {
  const current = await loadClientConfig(clientId);
  const next = {
    ...current,
    templateVersion: current.templateVersion + 1,
    template,
    brand,
    templateVariants: templateVariants ?? current.templateVariants ?? [],
    templateRules: templateRules ?? current.templateRules ?? [],
  };
  const errors = validateClientConfig(next, clientId);
  if (errors.length > 0) {
    const error = new Error(errors.join("; "));
    error.statusCode = 400;
    throw error;
  }

  const configPath = path.join(PROJECT_ROOT, "clients", `${clientId}.json`);
  const temporaryPath = `${configPath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporaryPath, configPath);
  return next;
}

export async function saveClientCatalogFilter(clientId, { field, values }) {
  const current = await loadClientConfig(clientId);
  const rules = current.filters.rules.filter((rule) => rule.operator !== "categoryIn");
  if (values.length > 0) rules.push({ field, operator: "categoryIn", value: values });
  const next = { ...current, filters: { ...current.filters, rules } };
  const errors = validateClientConfig(next, clientId);
  if (errors.length > 0) {
    const error = new Error(errors.join("; "));
    error.statusCode = 400;
    throw error;
  }

  const configPath = path.join(PROJECT_ROOT, "clients", `${clientId}.json`);
  const temporaryPath = `${configPath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temporaryPath, configPath);
  return next;
}
