import assert from "node:assert/strict";
import test from "node:test";

import { contentHash } from "../src/pipeline/content-hash.js";

const product = {
  id: "SKU-1",
  title: "Čierne kreslo",
  imageUrl: "https://example.com/chair.jpg",
  availability: "in_stock",
  price: { regular: 199, sale: 179, current: 179, currency: "EUR" },
  discountPercent: 10,
  source: { ignored: "source data not used by the template" },
};
const config = {
  templateVersion: 1,
  output: { width: 1080, height: 1080, format: "jpeg", quality: 90 },
  brand: { primaryColor: "#D9AF42", logoPath: "logo.svg" },
  template: { padding: 48, price: { show: true } },
};

test("content hash is stable across object key order", () => {
  const reorderedConfig = {
    brand: { logoPath: "logo.svg", primaryColor: "#D9AF42" },
    template: { price: { show: true }, padding: 48 },
    output: { quality: 90, format: "jpeg", height: 1080, width: 1080 },
    templateVersion: 1,
  };
  assert.equal(contentHash(product, config), contentHash(product, reorderedConfig));
});

test("content hash changes for every render input group", () => {
  const original = contentHash(product, config);
  assert.notEqual(contentHash({ ...product, title: "Biele kreslo" }, config), original);
  assert.notEqual(contentHash(product, { ...config, templateVersion: 2 }), original);
  assert.notEqual(contentHash(product, { ...config, output: { ...config.output, width: 1200 } }), original);
  assert.notEqual(contentHash(product, { ...config, brand: { ...config.brand, primaryColor: "#000000" } }), original);
  assert.notEqual(contentHash(product, { ...config, template: { ...config.template, padding: 60 } }), original);
});

test("content hash changes when background removal is enabled", () => {
  const original = contentHash(product, config);
  const withBackgroundRemoval = {
    ...config,
    template: {
      ...config.template,
      productImage: {
        fit: "contain",
        heightPercent: 62,
        backgroundRemoval: { enabled: true, provider: "birefnet", paddingPercent: 5 },
      },
    },
  };
  assert.notEqual(contentHash(product, withBackgroundRemoval), original);
});
