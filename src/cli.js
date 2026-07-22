#!/usr/bin/env node

import { loadClientConfig } from "./config/load-config.js";
import { validateClientConfig } from "./config/validate-config.js";
import { downloadFeed } from "./feed/download-feed.js";
import { filterProducts } from "./feed/filter-products.js";
import { normalizeProducts } from "./feed/normalize-product.js";
import { parseFeed } from "./feed/parse-feed.js";
import { formatPrice } from "./pricing/format-price.js";
import { renderCatalog } from "./pipeline/render-catalog.js";
import { publishCatalog } from "./pipeline/publish-catalog.js";
import { resolveProjectPath } from "./project-root.js";
import { renderProductToFile } from "./render/render-product.js";

function printUsage() {
  console.error("Usage:");
  console.error("  npm run validate <client>");
  console.error("  npm run inspect <client>");
  console.error("  npm run preview <client> <sku>");
  console.error("  npm run render <client> [--limit=N] [--force]");
  console.error("  npm run publish <client> [--limit=N] [--force]");
}

async function loadValidConfig(clientId) {
  const config = await loadClientConfig(clientId);
  const errors = validateClientConfig(config, clientId);
  if (errors.length > 0) {
    throw new Error(
      `Configuration ${JSON.stringify(clientId)} is invalid:\n${errors.map((error) => `  - ${error}`).join("\n")}`,
    );
  }
  return config;
}

async function validateCommand(clientId) {
  try {
    await loadValidConfig(clientId);
    console.log(`✓ Configuration ${JSON.stringify(clientId)} is valid.`);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
}

function shorten(value, maximumLength) {
  if (!value) return "";
  return value.length <= maximumLength ? value : `${value.slice(0, maximumLength - 1)}…`;
}

async function inspectCommand(clientId) {
  try {
    const config = await loadValidConfig(clientId);
    console.log(`Downloading ${config.name} feed…`);
    const source = await downloadFeed(config.feed.url);
    const sourceProducts = parseFeed(source, config.feed);
    const normalized = normalizeProducts(sourceProducts, config.feed.fields);
    const products = filterProducts(normalized.products, config.filters);

    console.log(
      `Found ${sourceProducts.length} products: ${products.length} passed filters, `
      + `${normalized.products.length - products.length} filtered out, ${normalized.errors.length} invalid.`,
    );

    const tableRow = (product) => ({
      ID: product.id,
      Title: shorten(product.title, 48),
      Price: formatPrice(product.price.current, product.price.currency),
      Original: product.price.sale === null ? "—" : formatPrice(product.price.regular, product.price.currency),
      Discount: product.discountPercent === null ? "—" : `${product.discountPercent} %`,
      Availability: product.availability ?? "—",
    });
    const firstProducts = products.slice(0, 10);
    console.table(firstProducts.map(tableRow));

    const discountedSample = products.find(
      (product) => product.discountPercent !== null && !firstProducts.includes(product),
    );
    if (discountedSample) {
      console.log("Discounted product check:");
      console.table([tableRow(discountedSample)]);
    }

    if (normalized.errors.length > 0) {
      console.warn("Products skipped during normalization:");
      for (const error of normalized.errors.slice(0, 10)) {
        console.warn(`  - ${error.id}: ${error.reason}`);
      }
      if (normalized.errors.length > 10) console.warn(`  …and ${normalized.errors.length - 10} more`);
    }
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
}

async function previewCommand(clientId, sku) {
  if (!sku) throw new Error("Missing SKU. Usage: npm run preview <client> <sku>");

  const config = await loadValidConfig(clientId);
  console.log(`Downloading ${config.name} feed…`);
  const source = await downloadFeed(config.feed.url);
  const sourceProducts = parseFeed(source, config.feed);
  const normalized = normalizeProducts(sourceProducts, config.feed.fields);
  const product = normalized.products.find((candidate) => candidate.id === sku);

  if (!product) {
    const normalizationError = normalized.errors.find((error) => error.id === sku);
    if (normalizationError) throw new Error(`Product ${JSON.stringify(sku)} is invalid: ${normalizationError.reason}.`);
    throw new Error(`Product ${JSON.stringify(sku)} was not found in the feed.`);
  }

  if (!filterProducts([product], config.filters).length) {
    console.warn(`Warning: product ${JSON.stringify(sku)} does not pass the catalog filters, but will be rendered for preview.`);
  }

  const outputPath = resolveProjectPath("preview.jpg");
  console.log(`Rendering ${product.id}…`);
  await renderProductToFile(product, config, outputPath);
  console.log(`✓ Preview written to ${outputPath}`);
}

function parseRenderOptions(args, environment = process.env) {
  const options = { force: environment.npm_config_force === "true" };
  if (environment.npm_config_limit !== undefined) {
    const limit = Number(environment.npm_config_limit);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
    options.limit = limit;
  }
  for (const argument of args) {
    if (argument === "--force") {
      options.force = true;
    } else if (argument.startsWith("--limit=")) {
      const limit = Number(argument.slice("--limit=".length));
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
      options.limit = limit;
    } else {
      throw new Error(`Unknown render option ${JSON.stringify(argument)}.`);
    }
  }
  return options;
}

async function renderCommand(clientId, args) {
  const config = await loadValidConfig(clientId);
  const options = parseRenderOptions(args);
  console.log(`Rendering ${config.name} catalog${options.limit ? ` (limit ${options.limit})` : ""}…`);
  const result = await renderCatalog(config, options);
  const seconds = (result.durationMs / 1000).toFixed(1);

  console.log(
    `✓ Finished in ${seconds}s: ${result.renderedCount} rendered, ${result.skippedCount} skipped, `
    + `${result.errors.length} failed.`,
  );
  console.log(
    `${result.eligibleCount} of ${result.sourceCount} products pass filters; `
    + `${result.supplementaryCount} rows written to the supplementary feed.`,
  );
  console.log(`Images: ${result.imageDirectory}`);
  console.log(`State: ${result.statePath}`);
  console.log(`Supplementary feed: ${result.supplementaryPath}`);

  if (result.errors.length > 0) {
    console.error("Product errors:");
    for (const error of result.errors) console.error(`  - ${error.id} [${error.stage}]: ${error.reason}`);
    process.exitCode = 1;
  }
}

async function publishCommand(clientId, args) {
  const config = await loadValidConfig(clientId);
  const options = parseRenderOptions(args);
  console.log(`Publishing ${config.name} catalog to R2${options.limit ? ` (limit ${options.limit})` : ""}…`);
  const result = await publishCatalog(config, options);
  const seconds = (result.durationMs / 1000).toFixed(1);

  console.log(
    `✓ Published in ${seconds}s: ${result.renderedCount} rendered, ${result.reusedLocalCount} local images reused, `
    + `${result.skippedCount} unchanged, `
    + `${result.uploadedImageCount} images uploaded, ${result.errors.length} failed.`,
  );
  console.log(`${result.supplementaryCount} rows uploaded in the supplementary feed.`);
  console.log(`Public supplementary feed: ${result.supplementaryCheck.feedUrl}`);
  console.log(`Public image verified: ${result.publicCheck.imageUrl}`);
  console.log(`Cache-Control: ${result.publicCheck.cacheControl}`);

  if (result.errors.length > 0) {
    console.error("Product errors:");
    for (const error of result.errors) console.error(`  - ${error.id} [${error.stage}]: ${error.reason}`);
    process.exitCode = 1;
  }
}

const [command, clientId, ...args] = process.argv.slice(2);

if (!clientId) {
  printUsage();
  process.exitCode = 1;
} else if (command === "validate") {
  await validateCommand(clientId);
} else if (command === "inspect") {
  await inspectCommand(clientId);
} else if (command === "preview") {
  try {
    await previewCommand(clientId, args[0]);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
} else if (command === "render") {
  try {
    await renderCommand(clientId, args);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
} else if (command === "publish") {
  try {
    await publishCommand(clientId, args);
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exitCode = 1;
  }
} else {
  printUsage();
  process.exitCode = 1;
}
