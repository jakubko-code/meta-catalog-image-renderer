import assert from "node:assert/strict";
import test from "node:test";

import { filterProducts } from "../src/feed/filter-products.js";

const products = [
  { id: "1", imageUrl: "https://example.com/1.jpg", source: { category: "KRESLÁ" } },
  { id: "2", imageUrl: "https://example.com/2.jpg", source: { category: "KRESLÁ > ZÁVESNÉ KRESLÁ" } },
  { id: "3", imageUrl: "https://example.com/3.jpg", source: { category: "KRESLÁ > MASÁŽNE KRESLÁ" } },
  { id: "4", imageUrl: "https://example.com/4.jpg", source: { category: "STOLY" } },
];

test("category filter includes the selected branch and all subcategories", () => {
  const filtered = filterProducts(products, {
    requireId: true,
    requireImage: true,
    rules: [{ field: "source.category", operator: "categoryIn", value: ["KRESLÁ"] }],
  });
  assert.deepEqual(filtered.map((product) => product.id), ["1", "2", "3"]);
});

test("multiple selected category branches use OR semantics", () => {
  const filtered = filterProducts(products, {
    requireId: true,
    requireImage: true,
    rules: [{ field: "source.category", operator: "categoryIn", value: ["KRESLÁ > ZÁVESNÉ KRESLÁ", "STOLY"] }],
  });
  assert.deepEqual(filtered.map((product) => product.id), ["2", "4"]);
});
