import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { protectWhiteProductStructure } from "../src/background/protect-white-product-structure.js";

async function rgba(width, height, pixel) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      data.set(value, (y * width + x) * 4);
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("repairs a severely overcut white area enclosed by a product frame", async () => {
  const source = await rgba(20, 20, (x, y) => {
    if (x >= 3 && x <= 16 && y >= 3 && y <= 16) {
      if (x === 3 || x === 16 || y === 3 || y === 16) return [30, 30, 30, 255];
      return [255, 255, 255, 255];
    }
    return [255, 255, 255, 255];
  });
  const cutout = await rgba(20, 20, (x, y) => (
    x >= 8 && x <= 12 && y >= 8 && y <= 12
      ? [100, 180, 220, 255]
      : [255, 255, 255, 0]
  ));

  const result = await protectWhiteProductStructure(source, cutout, {
    minimumEnclosedRatio: 0.01,
    maximumRetainedRatio: 0.6,
  });
  assert.equal(result.applied, true);
  const data = await sharp(result.image).ensureAlpha().raw().toBuffer();
  assert.equal(data[(10 * 20 + 10) * 4 + 3], 255);
  assert.equal(data[(4 * 20 + 4) * 4 + 3], 255);
  assert.equal(data[(1 * 20 + 1) * 4 + 3], 0);
});

test("does not alter a source that has no white outer background", async () => {
  const source = await rgba(10, 10, () => [40, 80, 120, 255]);
  const cutout = await rgba(10, 10, (x, y) => [40, 80, 120, x > 2 && y > 2 ? 255 : 0]);
  const result = await protectWhiteProductStructure(source, cutout);
  assert.equal(result.applied, false);
  assert.equal(result.reason, "non-white-background");
  assert.equal(result.image, cutout);
});
