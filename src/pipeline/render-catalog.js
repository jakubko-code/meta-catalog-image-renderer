import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { downloadFeed } from "../feed/download-feed.js";
import { filterProducts } from "../feed/filter-products.js";
import { normalizeProducts } from "../feed/normalize-product.js";
import { parseFeed } from "../feed/parse-feed.js";
import { resolveProjectPath } from "../project-root.js";
import { loadRenderAssets } from "../render/load-assets.js";
import { renderProduct } from "../render/render-product.js";
import { contentHash } from "./content-hash.js";
import { loadLocalState, saveLocalState } from "./local-state.js";
import { writeSupplementaryFeed } from "./supplementary-feed.js";
import { runWorkerPool } from "./worker-pool.js";

function safeProductId(id) {
  return encodeURIComponent(id).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function publicImageUrl(config, fileName) {
  return [
    config.storage.publicBaseUrl,
    config.storage.prefix,
    config.storage.imageKeyPrefix,
    fileName,
  ].map((part, index) => index === 0 ? part.replace(/\/$/, "") : part.replace(/^\/+|\/+$/g, "")).join("/");
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function stateEntry(product, hash, config) {
  const fileName = `${safeProductId(product.id)}-${hash}.jpg`;
  return {
    hash,
    fileName,
    imageLink: publicImageUrl(config, fileName),
  };
}

export async function renderCatalog(config, {
  limit,
  force = false,
  initialState,
  trustStateImages = false,
  onImageRendered,
  onProgress,
} = {}) {
  const reportProgress = (progress) => {
    if (!onProgress) return;
    try {
      onProgress(progress);
    } catch {
      // Stav UI nesmie zhodiť samotný katalógový beh.
    }
  };
  const startedAt = Date.now();
  reportProgress({ stage: "loadingFeed", completedCount: 0, totalCount: 0 });
  const source = await downloadFeed(config.feed.url);
  const sourceProducts = parseFeed(source, config.feed);
  const normalized = normalizeProducts(sourceProducts, config.feed.fields);
  const eligibleProducts = filterProducts(normalized.products, config.filters);
  const selectedProducts = limit === undefined ? eligibleProducts : eligibleProducts.slice(0, limit);
  reportProgress({
    stage: "preparing",
    completedCount: 0,
    totalCount: selectedProducts.length,
    renderedCount: 0,
    skippedCount: 0,
    failedCount: normalized.errors.length,
  });

  const clientOutputDirectory = resolveProjectPath(path.join("out", config.clientId));
  const imageDirectory = path.join(clientOutputDirectory, config.storage.imageKeyPrefix);
  const statePath = path.join(clientOutputDirectory, config.storage.stateKey);
  const supplementaryPath = path.join(clientOutputDirectory, config.storage.supplementaryFeedKey);
  await mkdir(imageDirectory, { recursive: true });

  const previousState = initialState ?? await loadLocalState(statePath, config.clientId);
  const nextProducts = limit === undefined ? {} : { ...previousState.products };
  const pending = [];
  const reusable = [];
  let skipped = 0;
  let prepared = 0;

  for (const product of selectedProducts) {
    const hash = contentHash(product, config);
    const entry = stateEntry(product, hash, config);
    const imagePath = path.join(imageDirectory, entry.fileName);
    delete nextProducts[product.id];

    const previous = previousState.products[product.id];
    const imageExists = await fileExists(imagePath);
    const previousMatches = previous?.hash === hash && previous.fileName === entry.fileName;
    const canSkip = trustStateImages
      ? previousMatches
      : imageExists && (!previous || previousMatches);
    if (!force && canSkip) {
      nextProducts[product.id] = entry;
      skipped += 1;
    } else if (!force && trustStateImages && imageExists && onImageRendered) {
      reusable.push({ product, entry, imagePath });
    } else {
      pending.push({ product, entry, imagePath });
    }
    prepared += 1;
    reportProgress({
      stage: "preparing",
      completedCount: prepared,
      totalCount: selectedProducts.length,
      renderedCount: 0,
      skippedCount: skipped,
      failedCount: normalized.errors.length,
    });
  }

  let processedCount = skipped;
  let renderedProgressCount = 0;
  let reusedProgressCount = 0;
  let failedProgressCount = normalized.errors.length;
  const reportProcessing = () => reportProgress({
    stage: "rendering",
    completedCount: processedCount,
    totalCount: selectedProducts.length,
    renderedCount: renderedProgressCount,
    reusedLocalCount: reusedProgressCount,
    skippedCount: skipped,
    failedCount: failedProgressCount,
  });
  reportProcessing();

  const reuseResults = await runWorkerPool(
    reusable,
    config.processing.concurrency,
    async ({ product, entry, imagePath }) => {
      try {
        const image = await readFile(imagePath);
        await onImageRendered({ product, entry, image, reused: true });
        nextProducts[product.id] = entry;
        reusedProgressCount += 1;
        processedCount += 1;
        reportProcessing();
        return { status: "reused", id: product.id };
      } catch (error) {
        delete nextProducts[product.id];
        failedProgressCount += 1;
        processedCount += 1;
        reportProcessing();
        return { status: "failed", id: product.id, reason: error.message };
      }
    },
  );

  const assets = pending.length > 0 ? await loadRenderAssets(config) : null;
  const renderResults = await runWorkerPool(
    pending,
    config.processing.concurrency,
    async ({ product, entry, imagePath }) => {
      try {
        const image = await renderProduct(product, config, assets);
        try {
          await writeFile(imagePath, image, { flag: "wx" });
        } catch (error) {
          if (error.code !== "EEXIST") throw error;
          const existingImage = await readFile(imagePath);
          if (!existingImage.equals(image)) {
            throw new Error("immutable image already exists with different bytes; increase templateVersion");
          }
        }
        if (onImageRendered) await onImageRendered({ product, entry, image });
        nextProducts[product.id] = entry;
        renderedProgressCount += 1;
        processedCount += 1;
        reportProcessing();
        return { status: "rendered", id: product.id };
      } catch (error) {
        delete nextProducts[product.id];
        failedProgressCount += 1;
        processedCount += 1;
        reportProcessing();
        return { status: "failed", id: product.id, reason: error.message };
      }
    },
  );

  const state = { version: 1, clientId: config.clientId, products: nextProducts };
  await saveLocalState(statePath, state);

  const supplementaryRows = [];
  for (const product of eligibleProducts) {
    const entry = nextProducts[product.id];
    if (!entry || entry.hash !== contentHash(product, config)) continue;
    if (!trustStateImages && !await fileExists(path.join(imageDirectory, entry.fileName))) continue;
    supplementaryRows.push({ id: product.id, imageLink: entry.imageLink });
  }
  await writeSupplementaryFeed(supplementaryPath, supplementaryRows);

  const reuseErrors = reuseResults.filter((result) => result.status === "failed");
  const renderErrors = renderResults.filter((result) => result.status === "failed");
  const errors = [
    ...normalized.errors.map((error) => ({ ...error, stage: "normalize" })),
    ...[...reuseErrors, ...renderErrors].map((error) => ({ id: error.id, reason: error.reason, stage: "render" })),
  ];

  reportProgress({
    stage: "finalizing",
    completedCount: selectedProducts.length,
    totalCount: selectedProducts.length,
    renderedCount: renderResults.length - renderErrors.length,
    reusedLocalCount: reuseResults.filter((result) => result.status === "reused").length,
    skippedCount: skipped,
    failedCount: errors.length,
  });

  return {
    sourceCount: sourceProducts.length,
    eligibleCount: eligibleProducts.length,
    selectedCount: selectedProducts.length,
    filteredCount: normalized.products.length - eligibleProducts.length,
    renderedCount: renderResults.length - renderErrors.length,
    reusedLocalCount: reuseResults.filter((result) => result.status === "reused").length,
    skippedCount: skipped,
    failedCount: errors.length,
    supplementaryCount: supplementaryRows.length,
    errors,
    statePath,
    supplementaryPath,
    imageDirectory,
    state,
    supplementaryRows,
    durationMs: Date.now() - startedAt,
  };
}
