import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { removeConnectedBackground } from "../src/background/gemini-background-removal.js";
import { refineU2NetMask, resolveU2NetPython } from "../src/background/u2net-background-removal.js";
import { normalizeCutoutCanvas } from "../src/background/normalize-cutout.js";
import { backgroundRemovalHandler } from "../src/ui/handlers.js";

test("connected chroma background becomes transparent without removing the product", async () => {
  const source = await sharp({
    create: { width: 80, height: 80, channels: 3, background: "#00ff00" },
  }).composite([{
    input: await sharp({ create: { width: 36, height: 44, channels: 3, background: "#dc2626" } }).png().toBuffer(),
    left: 22,
    top: 18,
  }]).png().toBuffer();
  const output = await removeConnectedBackground(source);
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(40, 40), 255);
});

test("Gemini chroma key removes green spill from a soft connected edge", async () => {
  const source = await sharp({
    create: { width: 3, height: 1, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
  }).raw().toBuffer();
  source.set([80, 150, 70, 255], 4);
  source.set([180, 80, 90, 255], 8);
  const encoded = await sharp(source, { raw: { width: 3, height: 1, channels: 4 } }).png().toBuffer();
  const output = await removeConnectedBackground(encoded);
  const pixels = await sharp(output).ensureAlpha().raw().toBuffer();
  assert.equal(pixels[3], 0);
  assert.ok(pixels[7] > 0 && pixels[7] < 255);
  assert.ok(pixels[5] <= Math.max(pixels[4], pixels[6]) + 8);
  assert.equal(pixels[11], 255);
});

test("Gemini chroma key removes an isolated pure-green hole", async () => {
  const source = await sharp({
    create: { width: 5, height: 5, channels: 4, background: { r: 210, g: 100, b: 120, alpha: 1 } },
  }).composite([{
    input: await sharp({ create: { width: 1, height: 1, channels: 4, background: "#00ff00" } }).png().toBuffer(),
    left: 2,
    top: 2,
  }]).png().toBuffer();
  const output = await removeConnectedBackground(source);
  const pixels = await sharp(output).ensureAlpha().raw().toBuffer();
  assert.equal(pixels[(2 * 5 + 2) * 4 + 3], 0);
});

test("U2Net refinement removes weak halo alpha and preserves solid product pixels", async () => {
  const input = await sharp(Buffer.from([20, 20, 20, 20, 40, 40, 40, 100, 80, 80, 80, 255]), {
    raw: { width: 3, height: 1, channels: 4 },
  }).png().toBuffer();
  const output = await refineU2NetMask(input, { alphaFloor: 48 });
  const pixels = await sharp(output).ensureAlpha().raw().toBuffer();
  assert.equal(pixels[3], 0);
  assert.ok(pixels[7] > 0 && pixels[7] < 100);
  assert.equal(pixels[11], 255);
});

test("cutout normalization trims empty space and fills a square canvas", async () => {
  const product = await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: await sharp({ create: { width: 20, height: 40, channels: 4, background: "#dc2626" } }).png().toBuffer(),
    left: 40,
    top: 30,
  }]).png().toBuffer();
  const output = await normalizeCutoutCanvas(product, { size: 200, paddingRatio: 0.05 });
  const { data, info } = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = 0;
  let top = info.height;
  let bottom = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  assert.equal(info.width, 200);
  assert.equal(info.height, 200);
  assert.ok(bottom - top >= 175);
  assert.ok(left >= 50 && right <= 150);
});

test("configured U2Net Python executable takes precedence", async () => {
  assert.equal(await resolveU2NetPython({ REMBG_PYTHON: "/custom/python" }), "/custom/python");
});

test("background removal rejects an unknown provider before loading a client", async () => {
  await assert.rejects(
    backgroundRemovalHandler({
      params: { id: "test" },
      body: { sku: "sku-1", provider: "unknown" },
    }),
    (error) => error.statusCode === 400 && /provider/.test(error.message),
  );
});
