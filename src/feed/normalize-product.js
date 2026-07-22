import { parsePrice } from "../pricing/parse-price.js";

function readMappedField(source, mapping) {
  if (Object.hasOwn(source, mapping)) return source[mapping];
  return mapping.split(".").reduce((value, segment) => value?.[segment], source);
}

function scalar(value) {
  if (Array.isArray(value)) return scalar(value[0]);
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return value["#text"] ?? null;
  return String(value).trim();
}

export function normalizeAvailability(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeProduct(source, fields) {
  const id = scalar(readMappedField(source, fields.id));
  const regularPrice = parsePrice(scalar(readMappedField(source, fields.price)));
  const parsedSalePrice = parsePrice(scalar(readMappedField(source, fields.salePrice)), regularPrice?.currency);

  if (!id) throw new Error("missing product ID");
  if (!regularPrice) throw new Error("missing or invalid regular price");
  if (parsedSalePrice && parsedSalePrice.currency !== regularPrice.currency) {
    throw new Error(`sale price currency ${parsedSalePrice.currency} does not match ${regularPrice.currency}`);
  }

  const hasSale = parsedSalePrice && parsedSalePrice.amount < regularPrice.amount;
  const sale = hasSale ? parsedSalePrice.amount : null;
  const current = sale ?? regularPrice.amount;
  const discountPercent = sale === null || regularPrice.amount === 0
    ? null
    : Math.round(((regularPrice.amount - sale) / regularPrice.amount) * 100);

  return {
    id,
    title: scalar(readMappedField(source, fields.title)),
    imageUrl: scalar(readMappedField(source, fields.imageUrl)),
    availability: normalizeAvailability(scalar(readMappedField(source, fields.availability))),
    price: {
      regular: regularPrice.amount,
      sale,
      current,
      currency: regularPrice.currency,
    },
    discountPercent,
    source,
  };
}

export function normalizeProducts(sourceProducts, fields) {
  const products = [];
  const errors = [];

  for (const source of sourceProducts) {
    try {
      products.push(normalizeProduct(source, fields));
    } catch (error) {
      const id = scalar(readMappedField(source, fields.id)) ?? "unknown";
      errors.push({ id, reason: error.message });
    }
  }
  return { products, errors };
}
