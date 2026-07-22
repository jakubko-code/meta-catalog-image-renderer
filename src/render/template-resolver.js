function readField(product, field) {
  const path = field.startsWith("source.") ? field.slice(7) : field;
  const root = field.startsWith("source.") ? product.source : product;
  if (Object.hasOwn(root ?? {}, path)) return root[path];
  return path.split(".").reduce((value, segment) => value?.[segment], root);
}

function scalar(value) {
  if (Array.isArray(value)) return scalar(value[0]);
  if (value && typeof value === "object") return scalar(value["#text"]);
  return value;
}

export function matchesTemplateCondition(product, condition) {
  const value = scalar(readField(product, condition.field));
  const expected = condition.value;
  if (condition.operator === "eq") return value === expected;
  if (condition.operator === "neq") return value !== expected;
  if (condition.operator === "gte") return Number(value) >= Number(expected);
  if (condition.operator === "lte") return Number(value) <= Number(expected);
  if (condition.operator === "contains") return String(value ?? "").includes(String(expected));
  if (condition.operator === "categoryIn") {
    const category = String(value ?? "").trim();
    return expected.some((selected) => category === selected || category.startsWith(`${selected} > `));
  }
  return false;
}

export function resolveProductTemplate(product, config) {
  const variants = new Map((config.templateVariants ?? []).map((variant) => [variant.id, variant]));
  for (const rule of config.templateRules ?? []) {
    if (!rule.conditions.every((condition) => matchesTemplateCondition(product, condition))) continue;
    const variant = variants.get(rule.templateId);
    if (variant) return { id: variant.id, name: variant.name, template: variant.template, rule };
  }
  return { id: "default", name: "Predvolená", template: config.template, rule: null };
}
