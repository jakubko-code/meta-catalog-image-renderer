import assert from "node:assert/strict";
import test from "node:test";

import { parsePrice } from "../src/pricing/parse-price.js";

test("parses common Slovak and feed price formats", () => {
  assert.deepEqual(parsePrice("239.00 EUR"), { amount: 239, currency: "EUR" });
  assert.deepEqual(parsePrice("239,00 €"), { amount: 239, currency: "EUR" });
  assert.deepEqual(parsePrice("1 299,90 EUR"), { amount: 1299.9, currency: "EUR" });
  assert.deepEqual(parsePrice("EUR 1,299.90"), { amount: 1299.9, currency: "EUR" });
  assert.deepEqual(parsePrice("1.299,90 EUR"), { amount: 1299.9, currency: "EUR" });
});

test("handles missing, numeric and invalid prices", () => {
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("free"), null);
  assert.equal(parsePrice("-10 EUR"), null);
  assert.deepEqual(parsePrice(19.5), { amount: 19.5, currency: "EUR" });
});
