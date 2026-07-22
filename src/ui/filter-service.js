import { saveClientCatalogFilter } from "../config/load-config.js";
import { filterProducts } from "../feed/filter-products.js";
import { clearFeedCache, loadFeed } from "./feed-cache.js";

function scalar(value) {
  if (Array.isArray(value)) return scalar(value[0]);
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return value["#text"] === undefined ? null : scalar(value["#text"]);
  const text = String(value).trim();
  return text && text.length <= 200 ? text : null;
}

function categoryChoices(counts) {
  const branches = new Map();
  for (const [value, count] of counts) {
    const parts = value.split(/\s+>\s+/).map((part) => part.trim()).filter(Boolean);
    for (let index = 1; index <= parts.length; index += 1) {
      const branch = parts.slice(0, index).join(" > ");
      branches.set(branch, (branches.get(branch) ?? 0) + count);
    }
  }
  return [...branches].map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value, "sk"));
}

function fieldOptions(products, activeField) {
  const fields = new Map();
  for (const product of products) {
    for (const [key, rawValue] of Object.entries(product.source)) {
      const value = scalar(rawValue);
      if (!value) continue;
      if (!fields.has(key)) fields.set(key, new Map());
      const counts = fields.get(key);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const options = [...fields].map(([key, counts]) => {
    const field = `source.${key}`;
    const values = [...counts].map(([value, count]) => ({ value, count }));
    return { field, label: key, valueCount: counts.size, values, choices: categoryChoices(counts) };
  }).filter((option) => (
    option.field === activeField
    || (option.valueCount >= 2 && option.valueCount <= 500 && option.valueCount < products.length * 0.95)
  )).sort((left, right) => {
    const priority = (option) => /product.?type|categor|custom.?label/i.test(option.field) ? 0 : 1;
    return priority(left) - priority(right) || left.label.localeCompare(right.label, "sk");
  });
  const categoryFields = options.filter((option) => (
    option.field === activeField
    || /product.?type|categor|collection|department|taxonomy|custom.?label/i.test(option.field)
  ));
  return categoryFields.length ? categoryFields : options;
}

export async function getCatalogFilterOptions(config) {
  const feed = await loadFeed(config);
  const activeRule = config.filters.rules.find((rule) => rule.operator === "categoryIn") ?? null;
  const baseFilters = {
    ...config.filters,
    rules: config.filters.rules.filter((rule) => rule.operator !== "categoryIn"),
  };
  const baseProducts = filterProducts(feed.allProducts, baseFilters);
  const fields = fieldOptions(baseProducts, activeRule?.field);
  const suggestedField = fields.find((option) => /product.?type|categor/i.test(option.field))?.field ?? fields[0]?.field ?? null;
  return {
    enabled: Boolean(activeRule),
    field: activeRule?.field ?? suggestedField,
    values: activeRule?.value ?? [],
    baseCount: baseProducts.length,
    eligibleCount: feed.eligibleCount,
    fields,
  };
}

export async function updateCatalogFilter(config, input) {
  const options = await getCatalogFilterOptions(config);
  const field = input.field?.trim();
  const values = Array.isArray(input.values)
    ? [...new Set(input.values.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))]
    : null;
  if (!values) {
    const error = new Error("values must be an array.");
    error.statusCode = 400;
    throw error;
  }
  if (values.length > 100) {
    const error = new Error("At most 100 category branches may be selected.");
    error.statusCode = 400;
    throw error;
  }
  const selectedField = options.fields.find((option) => option.field === field);
  if (values.length > 0 && !selectedField) {
    const error = new Error("The selected feed field is not available for category filtering.");
    error.statusCode = 400;
    throw error;
  }
  const allowedValues = new Set(selectedField?.choices.map((choice) => choice.value) ?? []);
  if (values.some((value) => !allowedValues.has(value))) {
    const error = new Error("One or more selected categories are not present in the feed.");
    error.statusCode = 400;
    throw error;
  }

  const next = await saveClientCatalogFilter(config.clientId, { field, values });
  clearFeedCache(config.clientId);
  return next;
}
