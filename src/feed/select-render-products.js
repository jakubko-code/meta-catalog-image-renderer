import { filterProducts } from "./filter-products.js";
import { resolveProductTemplate } from "../render/template-resolver.js";

function withoutCatalogCategoryRules(filters) {
  return {
    ...filters,
    rules: filters.rules.filter((rule) => rule.operator !== "categoryIn"),
  };
}

export function selectRenderProducts(products, config) {
  const baseProducts = filterProducts(products, withoutCatalogCategoryRules(config.filters));
  const catalogProducts = filterProducts(baseProducts, config.filters);
  const catalogIds = new Set(catalogProducts.map((product) => product.id));
  const ruleCounts = new Map((config.templateRules ?? []).map((rule) => [rule.id, 0]));
  const ruleProductIds = new Set();

  for (const product of baseProducts) {
    const selected = resolveProductTemplate(product, config);
    if (!selected.rule) continue;
    ruleCounts.set(selected.rule.id, (ruleCounts.get(selected.rule.id) ?? 0) + 1);
    ruleProductIds.add(product.id);
  }

  const selectedProducts = baseProducts.filter((product) => (
    catalogIds.has(product.id) || ruleProductIds.has(product.id)
  ));
  return {
    products: selectedProducts,
    baseProducts,
    catalogProducts,
    ruleCounts,
    addedByRulesCount: selectedProducts.filter((product) => !catalogIds.has(product.id)).length,
  };
}
