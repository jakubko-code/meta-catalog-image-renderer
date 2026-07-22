import assert from "node:assert/strict";
import test from "node:test";

import { resolveProductTemplate } from "../src/render/template-resolver.js";

const baseTemplate = { layout: "classic" };
const saleTemplate = { layout: "bottomBanner" };
const categoryTemplate = { layout: "split" };
const config = {
  template: baseTemplate,
  templateVariants: [
    { id: "category", name: "Kategória", template: categoryTemplate },
    { id: "sale", name: "Výpredaj", template: saleTemplate },
  ],
  templateRules: [
    {
      id: "chairs-first",
      name: "Závesné kreslá",
      templateId: "category",
      conditions: [{ field: "source.category", operator: "categoryIn", value: ["KRESLÁ > ZÁVESNÉ"] }],
    },
    {
      id: "sale-second",
      name: "Výpredaj",
      templateId: "sale",
      conditions: [{ field: "discountPercent", operator: "gte", value: 20 }],
    },
  ],
};

test("first matching template rule wins", () => {
  const selected = resolveProductTemplate({ discountPercent: 30, source: { category: "KRESLÁ > ZÁVESNÉ > RATTAN" } }, config);
  assert.equal(selected.id, "category");
  assert.equal(selected.template, categoryTemplate);
});

test("discount rule selects the sale template", () => {
  const selected = resolveProductTemplate({ discountPercent: 25, source: { category: "STOLY" } }, config);
  assert.equal(selected.id, "sale");
});

test("default template is a safe fallback", () => {
  const selected = resolveProductTemplate({ discountPercent: null, source: { category: "STOLY" } }, config);
  assert.equal(selected.id, "default");
  assert.equal(selected.template, baseTemplate);
});
