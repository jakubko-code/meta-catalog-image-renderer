import { downloadFeed } from "../feed/download-feed.js";
import { filterProducts } from "../feed/filter-products.js";
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
  const products = filterProducts(normalized.products, config.filters);
  const value = {
    sourceCount: sourceProducts.length,
    normalizedCount: normalized.products.length,
    eligibleCount: products.length,
    filteredCount: normalized.products.length - products.length,
    invalidCount: normalized.errors.length,
    errors: normalized.errors,
    allProducts: normalized.products,
    products,
    loadedAt: new Date(now).toISOString(),
  };

  cache.set(config.clientId, { loadedAt: now, value });
  return value;
}

export function clearFeedCache(clientId) {
  if (clientId) cache.delete(clientId);
  else cache.clear();
}
