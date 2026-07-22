import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import satori from "satori";

import { createProductTemplate } from "../src/render/product-template.js";
import { resolveProjectPath } from "../src/project-root.js";

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const product = {
  id: "SKU-1",
  title: "Ukážkový produkt vo výpredaji",
  discountPercent: 25,
  price: { regular: 199, sale: 149, current: 149, currency: "EUR" },
};
const template = {
  layout: "classic",
  backgroundColor: "#f7f5ef",
  padding: 48,
  productImage: { fit: "contain", heightPercent: 62 },
  logo: { show: true, position: "topLeft", maxWidth: 220 },
  price: {
    show: true, position: "bottomLeft", fontSize: 64, showOriginalPrice: true,
    saleLabel: "AKCIOVÁ CENA", regularLabel: "CENA", backgroundColor: "#111111",
    textColor: "#ffffff", originalPriceColor: "#58a6a0",
  },
  discountBadge: {
    show: true, minimumPercent: 1, position: "topRight", text: "-{percent} %",
    backgroundColor: "#cb2d3e", textColor: "#ffffff",
  },
  title: { show: true, fontSize: 30, maxCharacters: 72, textColor: "#111111" },
};
const config = {
  output: { width: 1080, height: 1080 },
  brand: { primaryColor: "#58a6a0" },
  template,
};

test("all template layouts produce valid Satori SVG", async () => {
  const [regular, bold] = await Promise.all([
    readFile(resolveProjectPath("assets/fonts/Poppins-Regular.ttf")),
    readFile(resolveProjectPath("assets/fonts/Poppins-Bold.ttf")),
  ]);
  for (const layout of ["classic", "split", "bottomBanner", "minimal"]) {
    const tree = createProductTemplate(product, { ...config, template: { ...template, layout } }, {
      logo: { dataUri: pixel, aspectRatio: 1 },
    }, pixel);
    const svg = await satori(tree, {
      width: 1080,
      height: 1080,
      fonts: [
        { name: "BrandFont", data: regular, weight: 400, style: "normal" },
        { name: "BrandFont", data: bold, weight: 700, style: "normal" },
      ],
    });
    assert.match(svg, /^<svg/);
  }
});

test("template theme overrides the shared client brand color", () => {
  const tree = createProductTemplate(product, {
    ...config,
    template: { ...template, theme: { primaryColor: "#00ff1e" } },
  }, { logo: { dataUri: pixel, aspectRatio: 1 } }, pixel);
  assert.equal(tree.props.children[0].props.style.backgroundColor, "#00ff1e");
  assert.match(tree.props.children[1].props.style.border, /#00ff1e/);
});
