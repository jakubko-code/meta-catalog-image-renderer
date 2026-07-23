import { renderTemplateDesign } from "./designs/registry.js";

export function createProductTemplate(product, config, assets, productImage) {
  const designId = config.template.layout ?? "classic";
  return renderTemplateDesign(designId, product, config, assets, productImage);
}
