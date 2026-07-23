import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import satori from "satori";

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
const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024;
const MAX_FONT_BYTES = 3 * 1024 * 1024;

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
      fontRegularPath: brand.fontRegularPath ?? "assets/fonts/Poppins-Regular.ttf",
      fontBoldPath: brand.fontBoldPath ?? "assets/fonts/Poppins-Bold.ttf",
    },
    template: {
      layout: "classic",
      theme: { primaryColor },
      backgroundColor: color(brand.backgroundColor, "#F7F5EF"),
      padding: 48,
      productImage: {
        fit: "contain",
        heightPercent: 62,
        backgroundRemoval: { enabled: false, provider: "birefnet", paddingPercent: 5 },
      },
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

export async function prepareClientLogo(logo, name) {
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

export async function prepareClientBackground(background) {
  if (!background || typeof background.data !== "string" || !background.data) {
    throw badRequest("Background image data is missing.");
  }
  const source = Buffer.from(background.data, "base64");
  if (!source.length || source.length > MAX_BACKGROUND_BYTES) {
    throw badRequest("Background image must be smaller than 10 MB.");
  }
  try {
    const image = sharp(source, { density: 144 });
    const metadata = await image.metadata();
    if (metadata.width !== 1080 || metadata.height !== 1080) {
      throw badRequest(`Background image must be exactly 1080 × 1080 px; received ${metadata.width ?? "?"} × ${metadata.height ?? "?"} px.`);
    }
    return await image.png({ compressionLevel: 9 }).toBuffer();
  } catch (error) {
    if (error.statusCode === 400) throw error;
    throw badRequest("Background is not a valid PNG, JPEG or WebP image.");
  }
}

function decodeFont(upload, label) {
  if (!upload || typeof upload.data !== "string" || !upload.data) throw badRequest(`${label} font data is missing.`);
  const data = Buffer.from(upload.data, "base64");
  if (!data.length || data.length > MAX_FONT_BYTES) throw badRequest(`${label} font must be smaller than 3 MB.`);
  const signature = data.subarray(0, 4).toString("latin1");
  let extension;
  if (data[0] === 0x00 && data[1] === 0x01 && data[2] === 0x00 && data[3] === 0x00) extension = ".ttf";
  else if (signature === "true") extension = ".ttf";
  else if (signature === "OTTO") extension = ".otf";
  else if (signature === "wOFF") extension = ".woff";
  else if (signature === "wOF2") throw badRequest(`${label} font is WOFF2, which is not supported. Use TTF, OTF or WOFF.`);
  else throw badRequest(`${label} font is not a valid TTF, OTF or WOFF file.`);
  return { data, extension };
}

export async function prepareClientFonts(brand) {
  const hasRegular = Boolean(brand?.fontRegular);
  const hasBold = Boolean(brand?.fontBold);
  if (!hasRegular && !hasBold) return null;
  if (!hasRegular || !hasBold) throw badRequest("Upload both Regular and Bold font files, or leave both empty to use Poppins.");
  const regular = decodeFont(brand.fontRegular, "Regular");
  const bold = decodeFont(brand.fontBold, "Bold");
  try {
    await satori({
      type: "div",
      props: {
        style: { display: "flex", fontFamily: "ClientFont", fontSize: 24 },
        children: "Cena 239,00 € · ĽŠČŤŽ",
      },
    }, {
      width: 400,
      height: 60,
      fonts: [
        { name: "ClientFont", data: regular.data, weight: 400, style: "normal" },
        { name: "ClientFont", data: bold.data, weight: 700, style: "normal" },
      ],
    });
  } catch (error) {
    throw badRequest(`The uploaded fonts could not be loaded by the renderer: ${error.message}`);
  }
  return { regular, bold };
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
  const logo = await prepareClientLogo(input.brand?.logo, name);
  const fonts = await prepareClientFonts(input.brand);
  const fontRegularName = fonts ? `font-regular${fonts.regular.extension}` : null;
  const fontBoldName = fonts ? `font-bold${fonts.bold.extension}` : null;
  const config = buildClientConfig({
    clientId,
    name,
    feed: analysis.feed,
    availabilityFilter: input.availabilityFilter,
    brand: {
      ...input.brand,
      fontRegularPath: fonts ? `assets/clients/${clientId}/${fontRegularName}` : undefined,
      fontBoldPath: fonts ? `assets/clients/${clientId}/${fontBoldName}` : undefined,
    },
    storage: await sharedStorage(),
  });
  const errors = validateClientConfig(config, clientId);
  if (errors.length) throw badRequest(errors.join("; "));

  const clientDirectory = resolveProjectPath(`assets/clients/${clientId}`);
  const configPath = resolveProjectPath(`clients/${clientId}.json`);
  const suffix = `.tmp-${process.pid}-${randomUUID()}`;
  const temporaryLogoPath = path.join(clientDirectory, `logo.png${suffix}`);
  const temporaryConfigPath = `${configPath}${suffix}`;
  const fontFiles = fonts ? [
    { temporaryPath: path.join(clientDirectory, `${fontRegularName}${suffix}`), finalPath: path.join(clientDirectory, fontRegularName), data: fonts.regular.data },
    { temporaryPath: path.join(clientDirectory, `${fontBoldName}${suffix}`), finalPath: path.join(clientDirectory, fontBoldName), data: fonts.bold.data },
  ] : [];
  await mkdir(clientDirectory, { recursive: true });
  try {
    await writeFile(temporaryLogoPath, logo, { flag: "wx" });
    await Promise.all(fontFiles.map((font) => writeFile(font.temporaryPath, font.data, { flag: "wx" })));
    await writeFile(temporaryConfigPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
    await rename(temporaryLogoPath, path.join(clientDirectory, "logo.png"));
    await Promise.all(fontFiles.map((font) => rename(font.temporaryPath, font.finalPath)));
    await rename(temporaryConfigPath, configPath);
  } catch (error) {
    await Promise.allSettled([
      unlink(temporaryLogoPath),
      unlink(temporaryConfigPath),
      ...fontFiles.map((font) => unlink(font.temporaryPath)),
    ]);
    throw error;
  }
  return { config, analysis };
}
