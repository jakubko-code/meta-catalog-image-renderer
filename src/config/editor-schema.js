export const EDITOR_FIELD_OPTIONS = {
  "template.padding": { minimum: 0, maximum: 500, step: 1 },
  "template.productImage.fit": { options: ["contain", "cover"] },
  "template.productImage.heightPercent": { minimum: 1, maximum: 100, step: 1, suffix: "%" },
  "template.logo.position": { options: ["topLeft", "topRight", "bottomLeft", "bottomRight"] },
  "template.logo.maxWidth": { minimum: 1, maximum: 2000, step: 1, suffix: "px" },
  "template.price.position": { options: ["topLeft", "topRight", "bottomLeft", "bottomRight"] },
  "template.price.fontSize": { minimum: 1, maximum: 500, step: 1, suffix: "px" },
  "template.discountBadge.minimumPercent": { minimum: 1, maximum: 99, step: 1, suffix: "%" },
  "template.discountBadge.position": { options: ["topLeft", "topRight", "bottomLeft", "bottomRight"] },
  "template.title.fontSize": { minimum: 1, maximum: 200, step: 1, suffix: "px" },
  "template.title.maxCharacters": { minimum: 1, maximum: 500, step: 1 },
};

function labelFor(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function fieldType(key, value, metadata) {
  if (metadata.options) return "select";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (/color$/i.test(key) && /^#[0-9a-f]{6}$/i.test(value)) return "color";
  return "text";
}

function describeObject(value, path) {
  return Object.entries(value).map(([key, child]) => {
    const fieldPath = `${path}.${key}`;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return { kind: "group", key, label: labelFor(key), path: fieldPath, fields: describeObject(child, fieldPath) };
    }

    const metadata = EDITOR_FIELD_OPTIONS[fieldPath] ?? (
      typeof child === "number"
        ? { minimum: 0, maximum: Math.max(100, child * 2), step: 1 }
        : {}
    );
    return {
      kind: "field",
      key,
      label: labelFor(key),
      path: fieldPath,
      type: fieldType(key, child, metadata),
      ...metadata,
    };
  });
}

export function createEditorSchema(config) {
  return [
    { kind: "section", key: "brand", label: "Branding", fields: describeObject(config.brand, "brand") },
    { kind: "section", key: "template", label: "Šablóna", fields: describeObject(config.template, "template") },
  ];
}
