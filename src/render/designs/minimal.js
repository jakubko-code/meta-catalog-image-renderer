import { createStandardProductTemplate } from "./standard-design.js";

export function renderMinimal(product, config, assets, productImage) {
  return createStandardProductTemplate(product, config, assets, productImage, "minimal");
}
