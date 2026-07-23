import { createStandardProductTemplate } from "./standard-design.js";

export function renderSplit(product, config, assets, productImage) {
  return createStandardProductTemplate(product, config, assets, productImage, "split");
}
