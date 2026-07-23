import { createStandardProductTemplate } from "./standard-design.js";

export function renderBottomBanner(product, config, assets, productImage) {
  return createStandardProductTemplate(product, config, assets, productImage, "bottomBanner");
}
