import { loadClientConfig } from "../config/load-config.js";
import { validateClientConfig } from "../config/validate-config.js";
import { loadRenderAssets } from "../render/load-assets.js";
import { renderProduct } from "../render/render-product.js";
import { loadFeed } from "./feed-cache.js";

const assetCache = new Map();

export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class PreviewDroppedError extends HttpError {
  constructor() {
    super(409, "Preview was superseded by a newer request.");
  }
}

export class PreviewQueue {
  #running = false;
  #pending = null;

  enqueue(task) {
    return new Promise((resolve, reject) => {
      const item = { task, resolve, reject };
      if (!this.#running) this.#run(item);
      else {
        this.#pending?.reject(new PreviewDroppedError());
        this.#pending = item;
      }
    });
  }

  async #run(item) {
    this.#running = true;
    try {
      item.resolve(await item.task());
    } catch (error) {
      item.reject(error);
    } finally {
      const next = this.#pending;
      this.#pending = null;
      if (next) this.#run(next);
      else this.#running = false;
    }
  }
}

function assetKey(config) {
  return JSON.stringify({
    templateVersion: config.templateVersion,
    logoPath: config.brand.logoPath,
    backgroundImagePath: config.brand.backgroundImagePath,
    fontRegularPath: config.brand.fontRegularPath,
    fontBoldPath: config.brand.fontBoldPath,
    logoMaxWidths: [
      config.template.logo.maxWidth,
      ...(config.templateVariants ?? []).map((variant) => variant.template.logo.maxWidth),
    ],
  });
}

function cachedAssets(config) {
  const key = assetKey(config);
  if (!assetCache.has(key)) {
    const loading = loadRenderAssets(config).catch((error) => {
      assetCache.delete(key);
      throw error;
    });
    assetCache.set(key, loading);
  }
  return assetCache.get(key);
}

export async function renderDraftPreview(clientId, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Expected a JSON object.");
  }
  if (typeof body.sku !== "string" || !body.sku) throw new HttpError(400, "sku is required.");
  if (!body.template || !body.brand) throw new HttpError(400, "template and brand are required.");

  const savedConfig = await loadClientConfig(clientId);
  const draftConfig = { ...savedConfig, template: body.template, brand: body.brand };
  const validationErrors = validateClientConfig(draftConfig, clientId);
  if (validationErrors.length > 0) throw new HttpError(400, validationErrors.join("; "));

  const feed = await loadFeed(savedConfig);
  const product = feed.products.find((candidate) => candidate.id === body.sku);
  if (!product) throw new HttpError(404, `Product ${JSON.stringify(body.sku)} was not found among eligible products.`);

  const image = await renderProduct(product, draftConfig, await cachedAssets(draftConfig), body.template);
  return { image, product };
}
