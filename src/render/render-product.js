import { writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import satori from "satori";

import { createProductTemplate } from "./product-template.js";
import { removeProductBackgroundBiRefNet } from "../background/u2net-background-removal.js";
import { loadRenderAssets } from "./load-assets.js";
import { prepareSourceImage } from "./prepare-source-image.js";
import { resolveProductTemplate } from "./template-resolver.js";

async function prepareTemplateProductImage(product, config, template, { backgroundWorker } = {}) {
  const removal = template.productImage.backgroundRemoval;
  if (!removal?.enabled) return prepareSourceImage(product.imageUrl);
  const result = await removeProductBackgroundBiRefNet(product, config, {
    worker: backgroundWorker,
    paddingPercent: removal.paddingPercent,
  });
  return `data:image/png;base64,${result.image.toString("base64")}`;
}

export async function renderProduct(product, config, providedAssets, templateOverride, options = {}) {
  const selectedTemplate = templateOverride ?? resolveProductTemplate(product, config).template;
  const [assets, productImage] = await Promise.all([
    providedAssets ?? loadRenderAssets(config),
    prepareTemplateProductImage(product, config, selectedTemplate, options),
  ]);
  const tree = createProductTemplate(product, { ...config, template: selectedTemplate }, assets, productImage);
  const svg = await satori(tree, {
    width: config.output.width,
    height: config.output.height,
    fonts: assets.fonts,
  });
  const png = new Resvg(svg, {
    fitTo: { mode: "original" },
  }).render().asPng();

  return sharp(png)
    .jpeg({ quality: config.output.quality, mozjpeg: true })
    .toBuffer();
}

export async function renderProductToFile(product, config, outputPath, assets) {
  const image = await renderProduct(product, config, assets);
  await writeFile(outputPath, image);
}
