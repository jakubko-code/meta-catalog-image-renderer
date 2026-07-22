import { downloadFeed } from "../feed/download-feed.js";
import { selectRenderProducts } from "../feed/select-render-products.js";
import { normalizeProducts } from "../feed/normalize-product.js";
import { parseFeed } from "../feed/parse-feed.js";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export async function loadFeed(config, { force = false, ttlMs = DEFAULT_TTL_MS } = {}) {
  const cached = cache.get(config.clientId);
  const now = Date.now();

  if (!force && cached && now - cached.loadedAt < ttlMs) return cached.value;

  const source = await downloadFeed(config.feed.url);
  const sourceProducts = parseFeed(source, config.feed);
  const normalized = normalizeProducts(sourceProducts, config.feed.fields);
  const selection = selectRenderProducts(normalized.products, config);
  const products = selection.products;
  const value = {
    sourceCount: sourceProducts.length,
    normalizedCount: normalized.products.length,
    eligibleCount: products.length,
    filteredCount: normalized.products.length - products.length,
    invalidCount: normalized.errors.length,
    errors: normalized.errors,
    allProducts: normalized.products,
    products,
    catalogProductCount: selection.catalogProducts.length,
    addedByTemplateRulesCount: selection.addedByRulesCount,
    templateRuleCounts: Object.fromEntries(selection.ruleCounts),
    loadedAt: new Date(now).toISOString(),
  };

  cache.set(config.clientId, { loadedAt: now, value });
  return value;
}

export function clearFeedCache(clientId) {
  if (clientId) cache.delete(clientId);
  else cache.clear();
}
