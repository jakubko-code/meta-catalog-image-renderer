import { createHash } from "node:crypto";
import { resolveProductTemplate } from "../render/template-resolver.js";
import { LOCAL_BACKGROUND_PIPELINE_VERSION } from "../background/u2net-background-removal.js";
import { getTemplateDesign } from "../template-designs/catalog.js";

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
  const design = getTemplateDesign(selected.template.layout);
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
    ...(design?.version > 1 ? { templateDesignVersion: design.version } : {}),
    backgroundRemovalPipelineVersion: selected.template.productImage?.backgroundRemoval?.enabled
      ? LOCAL_BACKGROUND_PIPELINE_VERSION
      : null,
  });
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 16);
}
