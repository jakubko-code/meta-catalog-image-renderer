import { renderBottomBanner } from "./bottom-banner.js";
import { renderClassic } from "./classic.js";
import { renderCleanBackdrop } from "./clean-backdrop.js";
import { renderMinimal } from "./minimal.js";
import { renderSplit } from "./split.js";

const renderers = new Map([
  ["classic", renderClassic],
  ["split", renderSplit],
  ["bottomBanner", renderBottomBanner],
  ["minimal", renderMinimal],
  ["cleanBackdrop", renderCleanBackdrop],
]);

export function renderTemplateDesign(designId, product, config, assets, productImage) {
  const renderer = renderers.get(designId);
  if (!renderer) throw new Error(`Unknown template design ${JSON.stringify(designId)}.`);
  return renderer(product, config, assets, productImage);
}
