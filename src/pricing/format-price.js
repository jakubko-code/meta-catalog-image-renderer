const formatters = new Map();

export function formatPrice(amount, currency = "EUR") {
  const key = `sk-SK:${currency}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat("sk-SK", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
  }
  return formatters.get(key).format(amount);
}
