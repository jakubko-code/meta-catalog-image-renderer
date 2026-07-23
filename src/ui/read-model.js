import { stat } from "node:fs/promises";
import { createEditorSchema } from "../config/editor-schema.js";
import { listClientIds, loadClientConfig } from "../config/load-config.js";
import { validateClientConfig } from "../config/validate-config.js";
import { loadLocalState } from "../pipeline/local-state.js";
import { contentHash } from "../pipeline/content-hash.js";
import { resolveProjectPath } from "../project-root.js";
import { loadFeed } from "./feed-cache.js";
import { loadRuns } from "./run-store.js";
import { templateDesignLibrary } from "../template-designs/catalog.js";

async function loadValidConfig(clientId) {
  const config = await loadClientConfig(clientId);
  const errors = validateClientConfig(config, clientId);
  if (errors.length > 0) throw new Error(errors.join("; "));
  return config;
}

async function readStateSummary(clientId, eligibleProducts) {
  const statePath = resolveProjectPath(`out/${clientId}/state.json`);
  const state = await loadLocalState(statePath, clientId);
  let updatedAt = null;
  try {
    updatedAt = (await stat(statePath)).mtime.toISOString();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    renderedCount: eligibleProducts.filter((product) => state.products[product.id]).length,
    storedCount: Object.keys(state.products).length,
    updatedAt,
  };
}

export async function getClientOverview(clientId, { force = false } = {}) {
  const config = await loadValidConfig(clientId);
  const [feed, runs] = await Promise.all([
    loadFeed(config, { force }),
    loadRuns(clientId),
  ]);
  const state = await readStateSummary(clientId, feed.products);
  const lastRun = runs.at(0) ?? null;

  return {
    clientId,
    name: config.name,
    templateVersion: config.templateVersion,
    feed: {
      sourceCount: feed.sourceCount,
      eligibleCount: feed.eligibleCount,
      filteredCount: feed.filteredCount,
      invalidCount: feed.invalidCount,
      loadedAt: feed.loadedAt,
    },
    state,
    lastRun,
  };
}

export async function getClients(options = {}) {
  const clientIds = await listClientIds();
  const settled = await Promise.allSettled(clientIds.map((clientId) => getClientOverview(clientId, options)));

  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return { clientId: clientIds[index], name: clientIds[index], error: result.reason.message };
  });
}

export async function getClient(clientId, options = {}) {
  const [overview, config, runs] = await Promise.all([
    getClientOverview(clientId, options),
    loadValidConfig(clientId),
    loadRuns(clientId),
  ]);
  return {
    ...overview,
    config,
    editorSchema: createEditorSchema(config),
    templateDesignLibrary: templateDesignLibrary(),
    runs: runs.slice(0, 20),
  };
}

export async function getRuns(clientId) {
  await loadValidConfig(clientId);
  return loadRuns(clientId);
}

async function productRecord(product, config, state, lastRunErrorIds, today) {
  const entry = state.products[product.id];
  const isCurrent = entry?.hash === contentHash(product, config);
  let changedToday = false;
  if (isCurrent) {
    try {
      const imagePath = resolveProjectPath(`out/${config.clientId}/${config.storage.imageKeyPrefix}/${entry.fileName}`);
      changedToday = (await stat(imagePath)).mtime.toDateString() === today;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const hasError = lastRunErrorIds.has(product.id);
  return {
    id: product.id,
    title: product.title,
    imageUrl: product.imageUrl,
    sourceImageUrl: product.imageUrl,
    renderedImageUrl: isCurrent ? entry.imageLink : null,
    imageStatus: hasError ? "error" : isCurrent ? "ready" : entry ? "stale" : "missing",
    changedToday,
    availability: product.availability,
    price: product.price,
    discountPercent: product.discountPercent,
  };
}

export async function getProducts(clientId, {
  limit = 60,
  offset = 0,
  filter = "",
  category = "all",
} = {}) {
  const config = await loadValidConfig(clientId);
  const [feed, state, runs] = await Promise.all([
    loadFeed(config),
    loadLocalState(resolveProjectPath(`out/${clientId}/state.json`), clientId),
    loadRuns(clientId),
  ]);
  const lastRunErrorIds = new Set((runs[0]?.errors ?? []).map((error) => error.id));
  const today = new Date().toDateString();
  const records = await Promise.all(
    feed.products.map((product) => productRecord(product, config, state, lastRunErrorIds, today)),
  );
  const needle = filter.trim().toLocaleLowerCase("sk-SK");
  const searched = needle
    ? records.filter((product) => `${product.id} ${product.title ?? ""}`.toLocaleLowerCase("sk-SK").includes(needle))
    : records;
  const categoryProducts = searched.filter((product) => {
    if (category === "discounted") return product.discountPercent !== null;
    if (category === "changedToday") return product.changedToday;
    if (category === "errors") return product.imageStatus === "error";
    return true;
  });
  const facets = {
    all: searched.length,
    discounted: searched.filter((product) => product.discountPercent !== null).length,
    changedToday: searched.filter((product) => product.changedToday).length,
    errors: searched.filter((product) => product.imageStatus === "error").length,
  };
  return {
    products: categoryProducts.slice(offset, offset + limit),
    total: categoryProducts.length,
    limit,
    offset,
    category,
    facets,
  };
}
