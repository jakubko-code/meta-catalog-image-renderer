import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import satori from "satori";

import { createProductTemplate } from "../src/render/product-template.js";
import { resolveProjectPath } from "../src/project-root.js";
import { TEMPLATE_DESIGNS, TEMPLATE_DESIGN_CATEGORIES } from "../src/template-designs/catalog.js";

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

test("every registered template design produces valid Satori SVG", async () => {
  const [regular, bold] = await Promise.all([
    readFile(resolveProjectPath("assets/fonts/Poppins-Regular.ttf")),
    readFile(resolveProjectPath("assets/fonts/Poppins-Bold.ttf")),
  ]);
  for (const { id: layout } of TEMPLATE_DESIGNS) {
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

test("template design catalog contains unique IDs and complete metadata", () => {
  const ids = TEMPLATE_DESIGNS.map((design) => design.id);
  const categories = new Set(TEMPLATE_DESIGN_CATEGORIES.map((category) => category.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const design of TEMPLATE_DESIGNS) {
    assert.match(design.id, /^[a-z][a-zA-Z0-9]*$/);
    assert.ok(design.name);
    assert.ok(design.description);
    assert.ok(categories.has(design.category));
    assert.ok(Number.isInteger(design.version) && design.version >= 1);
  }
});

test("clean backdrop design has the requested reusable defaults", () => {
  const design = TEMPLATE_DESIGNS.find((candidate) => candidate.id === "cleanBackdrop");
  assert.equal(design.defaults.backgroundColor, "#FFFFFF");
  assert.equal(design.defaults.backgroundImage.show, false);
  assert.equal(design.defaults.productImage.backgroundRemoval.enabled, true);
  assert.equal(design.defaults.logo.position, "bottomRight");
  assert.equal(design.defaults.price.position, "topLeft");
  assert.match(design.defaults.discountBadge.text, /{percent}/);
  assert.equal(design.defaults.title.show, false);
});

test("clean backdrop places an uploaded background behind the product", () => {
  const tree = createProductTemplate(product, {
    ...config,
    template: {
      ...template,
      layout: "cleanBackdrop",
      backgroundImage: { show: true },
    },
  }, {
    logo: { dataUri: pixel, aspectRatio: 1 },
    background: { dataUri: pixel },
  }, pixel);
  assert.equal(tree.props.children[0].type, "img");
  assert.equal(tree.props.children[0].props.src, pixel);
  assert.equal(tree.props.children[0].props.style.objectFit, "cover");
});

test("template theme overrides the shared client brand color", () => {
  const tree = createProductTemplate(product, {
    ...config,
    template: { ...template, theme: { primaryColor: "#00ff1e" } },
  }, { logo: { dataUri: pixel, aspectRatio: 1 } }, pixel);
  assert.equal(tree.props.children[0].props.style.backgroundColor, "#00ff1e");
  assert.match(tree.props.children[1].props.style.border, /#00ff1e/);
});

test("background-removed product is placed directly on the template background", () => {
  const tree = createProductTemplate(product, {
    ...config,
    template: {
      ...template,
      productImage: {
        ...template.productImage,
        backgroundRemoval: { enabled: true, provider: "birefnet", paddingPercent: 5 },
      },
    },
  }, { logo: { dataUri: pixel, aspectRatio: 1 } }, pixel);
  const productContainer = tree.props.children[1];
  assert.equal(productContainer.props.style.backgroundColor, "transparent");
  assert.equal(productContainer.props.style.border, "0px solid transparent");
  assert.equal(productContainer.props.children.props.width, 984);
});
