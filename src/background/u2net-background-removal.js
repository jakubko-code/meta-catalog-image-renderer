import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

import { resolveProjectPath } from "../project-root.js";
import { downloadSourceImage } from "./gemini-background-removal.js";
import {
  createLocalBackgroundWorker,
  resolveLocalBackgroundPython,
} from "./local-background-worker.js";
import { normalizeCutoutCanvas } from "./normalize-cutout.js";
import { protectWhiteProductStructure } from "./protect-white-product-structure.js";

const U2NET_MODEL = "u2net";
const BIREFNET_MODEL = "birefnet-general-lite";
export const LOCAL_BACKGROUND_PIPELINE_VERSION = 6;
const DEFAULT_ALPHA_FLOOR = 48;

export const resolveU2NetPython = resolveLocalBackgroundPython;

function cacheKey(source, model, suffix = "") {
  return createHash("sha256")
    .update(source)
    .update(`\n${model}\n${LOCAL_BACKGROUND_PIPELINE_VERSION}\n${suffix}`)
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

async function runLocalModel(source, model, { environment = process.env, worker } = {}) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "feed-u2net-"));
  const inputPath = path.join(temporaryDirectory, "input.png");
  const outputPath = path.join(temporaryDirectory, "output.png");
  let activeWorker = worker;
  let ownWorker = false;
  try {
    await writeFile(inputPath, source, { flag: "wx" });
    if (!activeWorker) {
      activeWorker = await createLocalBackgroundWorker({ environment });
      ownWorker = true;
    }
    await activeWorker.process(inputPath, outputPath, model);
    return await readFile(outputPath);
  } catch (error) {
    const detail = String(error.stderr || error.message || error).trim();
    throw new Error(`Lokálne odstránenie pozadia cez ${model} zlyhalo: ${detail}`);
  } finally {
    if (ownWorker) await activeWorker?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function refineU2NetMask(input, { alphaFloor = DEFAULT_ALPHA_FLOOR } = {}) {
  if (!Number.isInteger(alphaFloor) || alphaFloor < 0 || alphaFloor >= 255) {
    throw new Error("U²-Net alphaFloor must be an integer from 0 to 254.");
  }
  const { data, info } = await sharp(input, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let offset = 3; offset < data.length; offset += 4) {
    const originalAlpha = data[offset];
    const alphaRatio = originalAlpha / 255;
    if (alphaRatio > 0.08 && alphaRatio < 0.995) {
      for (let channel = 0; channel < 3; channel += 1) {
        data[offset - 3 + channel] = Math.max(0, Math.min(255, Math.round(
          (data[offset - 3 + channel] - (1 - alphaRatio) * 255) / alphaRatio,
        )));
      }
    }
    data[offset] = originalAlpha <= alphaFloor
      ? 0
      : Math.round((originalAlpha - alphaFloor) * 255 / (255 - alphaFloor));
  }
  return sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
}

async function removeProductBackgroundLocal(product, config, {
  model,
  provider,
  force = false,
  environment = process.env,
  worker,
  paddingPercent = 5,
} = {}) {
  const directory = resolveProjectPath(path.join("out", config.clientId, "background-removal", provider));
  const rawDirectory = path.join(directory, "raw");
  const rawPath = path.join(rawDirectory, `${cacheKey(product.imageUrl, model)}.png`);
  const filePath = path.join(directory, `${cacheKey(product.imageUrl, model, `padding:${paddingPercent}`)}.png`);
  if (!force) {
    const cached = await readCached(filePath);
    if (cached) return { image: cached, cached: true, model, provider, filePath };
  }
  let refinedImage = !force ? await readCached(rawPath) : null;
  if (!refinedImage) {
    const source = await downloadSourceImage(product.imageUrl);
    const rawImage = await runLocalModel(source, model, { environment, worker });
    refinedImage = model === U2NET_MODEL
      ? await refineU2NetMask(rawImage)
      : await refineU2NetMask(rawImage, { alphaFloor: 24 });
    if (model === BIREFNET_MODEL) {
      const protectedResult = await protectWhiteProductStructure(source, refinedImage);
      if (protectedResult.applied) {
        refinedImage = await refineU2NetMask(protectedResult.image, { alphaFloor: 12 });
      }
    }
    await mkdir(rawDirectory, { recursive: true });
    const temporaryRawPath = `${rawPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryRawPath, refinedImage, { flag: "wx" });
    await rename(temporaryRawPath, rawPath);
  }
  const image = await normalizeCutoutCanvas(refinedImage, { paddingRatio: paddingPercent / 100 });
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporaryPath, image, { flag: "wx" });
  await rename(temporaryPath, filePath);
  return { image, cached: false, model, provider, filePath };
}

export async function removeProductBackgroundU2Net(product, config, options = {}) {
  return removeProductBackgroundLocal(product, config, {
    ...options,
    model: U2NET_MODEL,
    provider: "u2net",
  });
}

export async function removeProductBackgroundBiRefNet(product, config, options = {}) {
  return removeProductBackgroundLocal(product, config, {
    ...options,
    model: BIREFNET_MODEL,
    provider: "birefnet",
  });
}
