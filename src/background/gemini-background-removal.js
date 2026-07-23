import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { resolveProjectPath } from "../project-root.js";
import { normalizeCutoutCanvas } from "./normalize-cutout.js";

const DEFAULT_MODEL = "gemini-3.1-flash-image";
const PROMPT_VERSION = 2;
const MASK_VERSION = 5;
const EDGE_REFINEMENT_RADIUS = 12;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_RESULT_BYTES = 20 * 1024 * 1024;
const PROMPT = `Edit the provided e-commerce product image for background extraction.
Preserve the product itself exactly: its shape, proportions, colors, texture, labels, logos, details, and viewing angle must not change.
Remove the entire original background and all cast shadows. Do not move, resize, rotate, recenter, crop, or change the scale of the product. Keep it in the exact same pixel position and size. Replace only the background with a perfectly flat, uniform chroma green background with the exact color #00FF00.
The green background must contain no gradient, texture, lighting variation, shadow, reflection, border, text, or extra object. Do not add, redesign, retouch, crop, or repair the product. Return only the edited square image.`;

function requiredEnvironment(environment, key) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Missing ${key}. Add it to .env before testing Gemini background removal.`);
  return value;
}

export async function downloadSourceImage(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "MetaCatalogImageRenderer/0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`Product image download failed: ${error.message}`);
  }
  if (!response.ok) throw new Error(`Product image download failed with HTTP ${response.status}.`);
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_SOURCE_BYTES) throw new Error("Product image exceeds the 20 MB background-removal limit.");
  const source = Buffer.from(await response.arrayBuffer());
  if (source.length > MAX_SOURCE_BYTES) throw new Error("Product image exceeds the 20 MB background-removal limit.");
  return sharp(source, { failOn: "error", limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "contain", background: "#ffffff", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function findImageData(value) {
  if (!value || typeof value !== "object") return null;
  const mimeType = value.mime_type ?? value.mimeType;
  if (typeof mimeType === "string" && mimeType.startsWith("image/") && typeof value.data === "string") {
    return { mimeType, data: value.data };
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findImageData(child);
    if (found) return found;
  }
  return null;
}

async function callGemini(source, { environment = process.env, fetchImplementation = fetch } = {}) {
  const apiKey = requiredEnvironment(environment, "GEMINI_API_KEY");
  const model = environment.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(model)) throw new Error("GEMINI_IMAGE_MODEL has an invalid format.");
  let response;
  try {
    response = await fetchImplementation("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        input: [
          { type: "text", text: PROMPT },
          { type: "image", mime_type: "image/png", data: source.toString("base64") },
        ],
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: "1:1", image_size: "1K" },
      }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    throw new Error(`Gemini background removal request failed: ${error.message}`);
  }
  const responseText = await response.text();
  let body;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error(`Gemini returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`Gemini returned HTTP ${response.status}: ${body.error?.message ?? "unknown error"}`);
  }
  const image = findImageData(body);
  if (!image) throw new Error("Gemini did not return an image. Try another product or model.");
  const result = Buffer.from(image.data, "base64");
  if (!result.length || result.length > MAX_RESULT_BYTES) throw new Error("Gemini returned an invalid or oversized image.");
  return { image: result, model };
}

export async function removeConnectedBackground(input, {
  minimumGreenExcess = 8,
  transparentGreenExcess = 110,
  isolatedGreenExcess = 160,
} = {}) {
  const { data, info } = await sharp(input, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixelCount = width * height;
  const background = new Uint8Array(pixelCount);
  const queued = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const enqueue = (index) => {
    if (queued[index]) return;
    queued[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const offset = index * 4;
    const greenExcess = data[offset + 1] - Math.max(data[offset], data[offset + 2]);
    if (greenExcess <= minimumGreenExcess) continue;
    background[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const greenExcess = data[offset + 1] - Math.max(data[offset], data[offset + 2]);
    if (greenExcess >= isolatedGreenExcess) background[index] = 1;
  }
  const nearBackground = new Uint8Array(background);
  for (let pass = 0; pass < EDGE_REFINEMENT_RADIUS; pass += 1) {
    const previous = new Uint8Array(nearBackground);
    for (let index = 0; index < pixelCount; index += 1) {
      if (previous[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      if ((x > 0 && previous[index - 1])
        || (x + 1 < width && previous[index + 1])
        || (y > 0 && previous[index - width])
        || (y + 1 < height && previous[index + width])) {
        nearBackground[index] = 1;
      }
    }
  }
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const neutralGreen = Math.max(red, blue);
    const greenExcess = green - neutralGreen;
    if (!background[index] && !(nearBackground[index] && greenExcess > minimumGreenExcess)) continue;
    const alpha = Math.max(0, Math.min(1,
      1 - (greenExcess - minimumGreenExcess) / (transparentGreenExcess - minimumGreenExcess),
    ));
    data[offset + 1] = Math.min(green, neutralGreen);
    data[offset + 3] = Math.round(alpha * 255);
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

function cacheKey(source, model) {
  return createHash("sha256")
    .update(source)
    .update(`\n${model}\n${PROMPT_VERSION}`)
    .digest("hex")
    .slice(0, 24);
}

async function readCached(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function removeProductBackground(product, config, {
  force = false,
  environment = process.env,
  fetchImplementation = fetch,
} = {}) {
  const source = await downloadSourceImage(product.imageUrl);
  const model = environment.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
  const key = cacheKey(source, model);
  const directory = resolveProjectPath(path.join("out", config.clientId, "background-removal"));
  const rawDirectory = path.join(directory, "raw");
  const rawPath = path.join(rawDirectory, `${key}.jpg`);
  const legacyPath = path.join(directory, `${key}.png`);
  const filePath = path.join(directory, `${key}-mask-v${MASK_VERSION}.png`);
  if (!force) {
    const cached = await readCached(filePath);
    if (cached) return { image: cached, cached: true, model, filePath };
  }
  let generatedImage = !force ? await readCached(rawPath) : null;
  let generatedModel = model;
  let geminiCalled = false;
  if (!generatedImage && !force) generatedImage = await readCached(legacyPath);
  if (!generatedImage) {
    geminiCalled = true;
    const generated = await callGemini(source, { environment, fetchImplementation });
    generatedImage = generated.image;
    generatedModel = generated.model;
    await mkdir(rawDirectory, { recursive: true });
    const rawTemporaryPath = `${rawPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(rawTemporaryPath, generatedImage, { flag: "wx" });
    await rename(rawTemporaryPath, rawPath);
  }
  const chromaImage = await removeConnectedBackground(generatedImage);
  const image = await normalizeCutoutCanvas(chromaImage);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, image, { flag: "wx" });
  await rename(temporaryPath, filePath);
  return { image, cached: !geminiCalled, model: generatedModel, filePath };
}
