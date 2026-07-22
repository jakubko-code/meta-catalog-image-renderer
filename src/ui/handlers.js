import { getClient, getClients, getProducts, getRuns } from "./read-model.js";
import { createEditorSchema } from "../config/editor-schema.js";
import { saveClientTemplate } from "../config/load-config.js";
import { PreviewQueue, renderDraftPreview } from "./preview-service.js";
import { loadFeed } from "./feed-cache.js";
import { getRenderJob, startRenderJob } from "./run-store.js";
import { loadR2Usage } from "../storage/r2-usage.js";
import { analyzeClientFeed, createClient } from "../config/create-client.js";

const previewQueue = new PreviewQueue();

function json(body, status = 200) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

export async function listClientsHandler(request) {
  const force = request.url.searchParams.get("refresh") === "1";
  return json({ clients: await getClients({ force }) });
}

export async function analyzeClientFeedHandler(request) {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    const error = new Error("Expected a JSON object.");
    error.statusCode = 400;
    throw error;
  }
  return json({ analysis: await analyzeClientFeed(request.body) });
}

export async function createClientHandler(request) {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    const error = new Error("Expected a JSON object.");
    error.statusCode = 400;
    throw error;
  }
  const result = await createClient(request.body);
  return json(result, 201);
}

export async function clientHandler(request) {
  const force = request.url.searchParams.get("refresh") === "1";
  return json(await getClient(request.params.id, { force }));
}

export async function runsHandler(request) {
  return json({ runs: await getRuns(request.params.id) });
}

function integerQuery(url, name, fallback, minimum, maximum) {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    const error = new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function categoryQuery(url) {
  const category = url.searchParams.get("category") ?? "all";
  if (!["all", "discounted", "changedToday", "errors"].includes(category)) {
    const error = new Error("category must be one of all, discounted, changedToday or errors.");
    error.statusCode = 400;
    throw error;
  }
  return category;
}

export async function productsHandler(request) {
  const options = {
    limit: integerQuery(request.url, "limit", 60, 1, 1000),
    offset: integerQuery(request.url, "offset", 0, 0, Number.MAX_SAFE_INTEGER),
    filter: request.url.searchParams.get("filter") ?? "",
    category: categoryQuery(request.url),
  };
  return json(await getProducts(request.params.id, options));
}

export async function previewHandler(request) {
  const result = await previewQueue.enqueue(() => renderDraftPreview(request.params.id, request.body));
  return {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(result.image.length),
      "x-product-id": result.product.id,
    },
    body: result.image,
  };
}

export async function saveTemplateHandler(request) {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    const error = new Error("Expected a JSON object.");
    error.statusCode = 400;
    throw error;
  }
  const config = await saveClientTemplate(request.params.id, {
    template: request.body.template,
    brand: request.body.brand,
  });
  const feed = await loadFeed(config);
  return json({
    config,
    editorSchema: createEditorSchema(config),
    templateVersion: config.templateVersion,
    estimatedRerenderCount: feed.eligibleCount,
  });
}

export async function startRenderHandler(request) {
  const body = request.body ?? {};
  if (body.force !== undefined && typeof body.force !== "boolean") {
    const error = new Error("force must be a boolean.");
    error.statusCode = 400;
    throw error;
  }
  return json({ job: await startRenderJob(request.params.id, { force: body.force === true }) }, 202);
}

export async function renderStatusHandler(request) {
  return json({ job: getRenderJob(request.params.id) });
}

export async function r2UsageHandler(request) {
  const force = request.url.searchParams.get("refresh") === "1";
  return json({ usage: await loadR2Usage({ force }) });
}

export function errorResponse(error) {
  const notFound = /was not found/.test(error.message);
  return json({ error: error.message }, error.statusCode ?? (notFound ? 404 : 500));
}
