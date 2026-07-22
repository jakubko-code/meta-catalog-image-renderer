import { writeFile } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import satori from "satori";

import { createProductTemplate } from "./product-template.js";
import { loadRenderAssets } from "./load-assets.js";
import { prepareSourceImage } from "./prepare-source-image.js";
import { resolveProductTemplate } from "./template-resolver.js";

export async function renderProduct(product, config, providedAssets, templateOverride) {
  const [assets, productImage] = await Promise.all([
    providedAssets ?? loadRenderAssets(config),
    prepareSourceImage(product.imageUrl),
  ]);
  const selectedTemplate = templateOverride ?? resolveProductTemplate(product, config).template;
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
