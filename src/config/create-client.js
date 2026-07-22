import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { downloadFeed } from "../feed/download-feed.js";
import { filterProducts } from "../feed/filter-products.js";
import { normalizeProducts } from "../feed/normalize-product.js";
import { parseFeed } from "../feed/parse-feed.js";
import { resolveProjectPath } from "../project-root.js";
import { listClientIds, loadClientConfig } from "./load-config.js";
import { validateClientConfig } from "./validate-config.js";

const CLIENT_ID = /^[a-z0-9][a-z0-9-]*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizedFeed(feed) {
  if (!feed || typeof feed !== "object" || Array.isArray(feed)) throw badRequest("Feed settings are required.");
  const format = feed.format === "csv" ? "csv" : feed.format === "xml" ? "xml" : null;
  if (!format) throw badRequest("Feed format must be xml or csv.");
  const fields = {};
  for (const field of ["id", "title", "imageUrl", "price", "salePrice", "availability"]) {
    const value = feed.fields?.[field]?.trim();
    if (!value) throw badRequest(`Feed mapping ${field} is required.`);
    fields[field] = value;
  }
  const result = { url: feed.url?.trim(), format, fields };
  if (format === "xml") result.productPath = feed.productPath?.trim();
  else result.delimiter = feed.delimiter === "\\t" ? "\t" : feed.delimiter;
  return result;
}

function filtersFor(input) {
  return {
    requireId: true,
    requireImage: true,
    rules: input.availabilityFilter === false ? [] : [{
      field: "availability",
      operator: "in",
      value: ["in_stock", "preorder"],
    }],
  };
}

export async function analyzeClientFeed(input) {
  const feed = normalizedFeed(input.feed ?? input);
  const filters = filtersFor(input);
  const validationConfig = buildClientConfig({
    clientId: "feed-check",
    name: "Feed check",
    feed,
    availabilityFilter: input.availabilityFilter,
    storage: { bucket: "feed-check", publicBaseUrl: "https://example.com" },
  });
  const configErrors = validateClientConfig(validationConfig, "feed-check");
  if (configErrors.length) throw badRequest(configErrors.join("; "));

  const source = await downloadFeed(feed.url);
  const sourceProducts = parseFeed(source, feed);
  const normalized = normalizeProducts(sourceProducts, feed.fields);
  const eligible = filterProducts(normalized.products, filters);
  return {
    feed,
    sourceCount: sourceProducts.length,
    validCount: normalized.products.length,
    eligibleCount: eligible.length,
    invalidCount: normalized.errors.length,
    errors: normalized.errors.slice(0, 10),
    sample: eligible.slice(0, 3).map((product) => ({
      id: product.id,
      title: product.title,
      imageUrl: product.imageUrl,
      availability: product.availability,
      price: product.price,
      discountPercent: product.discountPercent,
    })),
  };
}

function color(value, fallback) {
  return HEX_COLOR.test(value ?? "") ? value : fallback;
}

export function buildClientConfig({ clientId, name, feed, availabilityFilter = true, brand = {}, storage }) {
  const primaryColor = color(brand.primaryColor, "#58A6A0");
  const accentColor = color(brand.accentColor, "#CB2D3E");
  return {
    clientId,
    name,
    templateVersion: 1,
    feed,
    filters: filtersFor({ availabilityFilter }),
    output: { width: 1080, height: 1080, format: "jpeg", quality: 90 },
    brand: {
      logoPath: `assets/clients/${clientId}/logo.png`,
      primaryColor,
      accentColor,
      textColor: "#FFFFFF",
      fontRegularPath: "assets/fonts/Poppins-Regular.ttf",
      fontBoldPath: "assets/fonts/Poppins-Bold.ttf",
    },
    template: {
      backgroundColor: color(brand.backgroundColor, "#F7F5EF"),
      padding: 48,
      productImage: { fit: "contain", heightPercent: 62 },
      logo: { show: Boolean(brand.logo), position: "topLeft", maxWidth: 220 },
      price: {
        show: true,
        position: "bottomLeft",
        fontSize: 64,
        showOriginalPrice: true,
        saleLabel: "AKCIOVÁ CENA",
        regularLabel: "CENA",
        backgroundColor: "#111111",
        textColor: "#FFFFFF",
        originalPriceColor: primaryColor,
      },
      discountBadge: {
        show: true,
        minimumPercent: 1,
        position: "topRight",
        text: "-{percent} %",
        backgroundColor: accentColor,
        textColor: "#FFFFFF",
      },
      title: { show: true, fontSize: 30, maxCharacters: 72, textColor: "#111111" },
    },
    processing: { concurrency: 4 },
    storage: {
      bucket: storage.bucket,
      publicBaseUrl: storage.publicBaseUrl,
      prefix: clientId,
      imageKeyPrefix: "images",
      stateKey: "state.json",
      supplementaryFeedKey: "supplementary.csv",
    },
  };
}

async function sharedStorage() {
  const clientIds = await listClientIds();
  if (!clientIds.length) throw new Error("At least one existing client is required to inherit the R2 bucket settings.");
  const config = await loadClientConfig(clientIds[0]);
  return { bucket: config.storage.bucket, publicBaseUrl: config.storage.publicBaseUrl };
}

function decodeLogo(logo) {
  if (!logo) return null;
  if (typeof logo.data !== "string" || !logo.data) throw badRequest("Logo data is missing.");
  const data = Buffer.from(logo.data, "base64");
  if (!data.length || data.length > MAX_LOGO_BYTES) throw badRequest("Logo must be smaller than 2 MB.");
  return data;
}

function placeholderLogo(name) {
  const safeName = String(name).replace(/[&<>"']/g, "").slice(0, 32);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220" viewBox="0 0 800 220"><rect width="800" height="220" rx="18" fill="#111111"/><text x="400" y="137" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="70" font-weight="700">${safeName}</text></svg>`);
}

async function renderLogo(logo, name) {
  const source = decodeLogo(logo) ?? placeholderLogo(name);
  try {
    return await sharp(source, { density: 240 })
      .resize({ width: 1200, height: 500, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw badRequest("Logo is not a valid SVG, PNG, JPEG or WebP image.");
  }
}

export async function createClient(input) {
  const clientId = input.clientId?.trim();
  const name = input.name?.trim();
  if (!CLIENT_ID.test(clientId ?? "")) throw badRequest("Client ID may only contain lowercase letters, numbers and hyphens.");
  if (!name) throw badRequest("Client name is required.");
  if ((await listClientIds()).includes(clientId)) {
    const error = new Error(`Client ${JSON.stringify(clientId)} already exists.`);
    error.statusCode = 409;
    throw error;
  }

  const analysis = await analyzeClientFeed(input);
  if (!analysis.validCount) throw badRequest("The feed did not produce any valid products with the selected field mapping.");
  if (!analysis.eligibleCount) throw badRequest("No products passed the selected availability filter.");
  const logo = await renderLogo(input.brand?.logo, name);
  const config = buildClientConfig({
    clientId,
    name,
    feed: analysis.feed,
    availabilityFilter: input.availabilityFilter,
    brand: input.brand,
    storage: await sharedStorage(),
  });
  const errors = validateClientConfig(config, clientId);
  if (errors.length) throw badRequest(errors.join("; "));

  const clientDirectory = resolveProjectPath(`assets/clients/${clientId}`);
  const configPath = resolveProjectPath(`clients/${clientId}.json`);
  const suffix = `.tmp-${process.pid}-${randomUUID()}`;
  const temporaryLogoPath = path.join(clientDirectory, `logo.png${suffix}`);
  const temporaryConfigPath = `${configPath}${suffix}`;
  await mkdir(clientDirectory, { recursive: true });
  try {
    await writeFile(temporaryLogoPath, logo, { flag: "wx" });
    await writeFile(temporaryConfigPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryLogoPath, path.join(clientDirectory, "logo.png"));
    await rename(temporaryConfigPath, configPath);
  } catch (error) {
    await Promise.allSettled([unlink(temporaryLogoPath), unlink(temporaryConfigPath)]);
    throw error;
  }
  return { config, analysis };
}
