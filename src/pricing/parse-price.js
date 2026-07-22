const CURRENCY_ALIASES = new Map([
  ["€", "EUR"],
  ["EUR", "EUR"],
  ["$", "USD"],
  ["USD", "USD"],
  ["CZK", "CZK"],
  ["KČ", "CZK"],
  ["PLN", "PLN"],
  ["ZŁ", "PLN"],
]);

function normalizeNumber(value) {
  const compact = value.replace(/[\s\u00a0\u202f']/g, "");
  if (!/^\d+(?:[.,]\d+)*$/.test(compact)) return null;

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);
  if (separatorIndex === -1) return compact;

  const digitsAfter = compact.length - separatorIndex - 1;
  const separatorCount = (compact.match(/[.,]/g) ?? []).length;
  const hasDecimals = digitsAfter === 1 || digitsAfter === 2 || (separatorCount > 1 && digitsAfter !== 3);

  if (!hasDecimals) return compact.replace(/[.,]/g, "");
  return `${compact.slice(0, separatorIndex).replace(/[.,]/g, "")}.${compact.slice(separatorIndex + 1)}`;
}

export function parsePrice(value, defaultCurrency = "EUR") {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? { amount: value, currency: defaultCurrency } : null;
  }
  if (typeof value !== "string") return null;

  const currencyToken = value.toUpperCase().match(/EUR|USD|CZK|KČ|PLN|ZŁ|€|\$/u)?.[0];
  const currency = CURRENCY_ALIASES.get(currencyToken) ?? defaultCurrency;
  const numericPart = value.toUpperCase().replace(/EUR|USD|CZK|KČ|PLN|ZŁ|€|\$/gu, "").trim();
  const normalized = normalizeNumber(numericPart);
  if (normalized === null) return null;

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? { amount, currency } : null;
}
