import assert from "node:assert/strict";
import test from "node:test";

import { selectRenderProducts } from "../src/feed/select-render-products.js";

const products = [
  { id: "1", imageUrl: "https://example.com/1.jpg", availability: "in_stock", discountPercent: null, source: { category: "TELEFÓNY" } },
  { id: "2", imageUrl: "https://example.com/2.jpg", availability: "in_stock", discountPercent: 20, source: { category: "NOTEBOOKY" } },
  { id: "3", imageUrl: "https://example.com/3.jpg", availability: "out_of_stock", discountPercent: 30, source: { category: "NOTEBOOKY" } },
];
const config = {
  filters: {
    requireId: true,
    requireImage: true,
    rules: [
      { field: "availability", operator: "in", value: ["in_stock"] },
      { field: "source.category", operator: "categoryIn", value: ["TELEFÓNY"] },
    ],
  },
  template: { layout: "classic" },
  templateVariants: [{ id: "sale", name: "Výpredaj", template: { layout: "minimal" } }],
  templateRules: [{
    id: "sale-products",
    name: "Výpredaj",
    templateId: "sale",
    conditions: [{ field: "discountPercent", operator: "gte", value: 1 }],
  }],
};

test("template rules add matching products outside the catalog category filter", () => {
  const result = selectRenderProducts(products, config);
  assert.deepEqual(result.products.map((product) => product.id), ["1", "2"]);
  assert.equal(result.catalogProducts.length, 1);
  assert.equal(result.addedByRulesCount, 1);
  assert.equal(result.ruleCounts.get("sale-products"), 1);
});

test("template rules do not bypass base availability filters", () => {
  const result = selectRenderProducts(products, config);
  assert.equal(result.products.some((product) => product.id === "3"), false);
});
