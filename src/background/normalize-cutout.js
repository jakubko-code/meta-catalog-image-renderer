import sharp from "sharp";

export async function normalizeCutoutCanvas(input, { size = 1024, paddingRatio = 0.05 } = {}) {
  if (!Number.isInteger(size) || size < 64) throw new Error("Cutout canvas size must be at least 64 pixels.");
  if (!(paddingRatio >= 0 && paddingRatio < 0.4)) throw new Error("Cutout paddingRatio must be from 0 to 0.4.");
  const target = Math.max(1, Math.round(size * (1 - paddingRatio * 2)));
  let trimmed;
  try {
    trimmed = await sharp(input, { failOn: "error" })
      .ensureAlpha()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
      .resize({ width: target, height: target, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new Error(`Transparent product could not be normalized: ${error.message}`);
  }
  const left = Math.floor((size - trimmed.info.width) / 2);
  const right = size - trimmed.info.width - left;
  const top = Math.floor((size - trimmed.info.height) / 2);
  const bottom = size - trimmed.info.height - top;
  return sharp(trimmed.data)
    .extend({
      left,
      right,
      top,
      bottom,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
