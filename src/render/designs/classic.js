import { createStandardProductTemplate } from "./standard-design.js";

export function renderClassic(product, config, assets, productImage) {
  return createStandardProductTemplate(product, config, assets, productImage, "classic");
}
