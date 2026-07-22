function readField(product, field) {
  const path = field.startsWith("source.") ? field.slice(7) : field;
  const root = field.startsWith("source.") ? product.source : product;
  if (Object.hasOwn(root, path)) return root[path];
  return path.split(".").reduce((value, segment) => value?.[segment], root);
}

function matches(value, operator, expected) {
  if (operator === "eq") return value === expected;
  if (operator === "neq") return value !== expected;
  if (operator === "in") return expected.includes(value);
  if (operator === "notIn") return !expected.includes(value);
  if (operator === "exists") {
    const exists = value !== undefined && value !== null && value !== "";
    return expected ? exists : !exists;
  }
  if (operator === "contains") {
    return Array.isArray(value) ? value.includes(expected) : String(value ?? "").includes(String(expected));
  }
  if (operator === "categoryIn") {
    const category = String(value?.["#text"] ?? value ?? "").trim();
    return expected.some((selected) => category === selected || category.startsWith(`${selected} > `));
  }
  return false;
}

export function filterProducts(products, filters) {
  return products.filter((product) => {
    if (filters.requireId && !product.id) return false;
    if (filters.requireImage && !product.imageUrl) return false;
    return filters.rules.every((rule) => matches(readField(product, rule.field), rule.operator, rule.value));
  });
}
