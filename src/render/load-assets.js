import { readFile } from "node:fs/promises";
import sharp from "sharp";

import { resolveProjectPath } from "../project-root.js";

async function loadFont(relativePath, label) {
  try {
    return await readFile(resolveProjectPath(relativePath));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${label} was not found at ${relativePath}.`);
    throw error;
  }
}

async function loadLogo(relativePath, maximumWidth) {
  let source;
  try {
    source = await readFile(resolveProjectPath(relativePath));
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Brand logo was not found at ${relativePath}.`);
    throw error;
  }

  const { data, info } = await sharp(source, { density: 240 })
    .trim({ background: "#ffffff", threshold: 8 })
    .resize({ width: maximumWidth * 2, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });

  return {
    dataUri: `data:image/png;base64,${data.toString("base64")}`,
    aspectRatio: info.width / info.height,
  };
}

export async function loadRenderAssets(config) {
  const [regular, bold, logo] = await Promise.all([
    loadFont(config.brand.fontRegularPath, "Regular font"),
    loadFont(config.brand.fontBoldPath, "Bold font"),
    loadLogo(config.brand.logoPath, config.template.logo.maxWidth),
  ]);

  return {
    fonts: [
      { name: "BrandFont", data: regular, weight: 400, style: "normal" },
      { name: "BrandFont", data: bold, weight: 700, style: "normal" },
    ],
    logo,
  };
}
