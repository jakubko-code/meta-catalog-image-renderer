import { createHash } from "node:crypto";
import { resolveProductTemplate } from "../render/template-resolver.js";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function contentHash(product, config) {
  const selected = resolveProductTemplate(product, config);
  const renderedProduct = {
    id: product.id,
    title: product.title,
    imageUrl: product.imageUrl,
    availability: product.availability,
    price: product.price,
    discountPercent: product.discountPercent,
  };
  const content = canonicalize({
    product: renderedProduct,
    templateId: selected.id,
    template: selected.template,
    brand: config.brand,
    output: config.output,
    templateVersion: config.templateVersion,
  });
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 16);
}
