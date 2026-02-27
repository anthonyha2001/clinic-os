export const CURRENCIES: Record<
  string,
  { symbol: string; code: string; name: string }
> = {
  USD: { symbol: "$", code: "USD", name: "US Dollar" },
  EUR: { symbol: "€", code: "EUR", name: "Euro" },
  GBP: { symbol: "£", code: "GBP", name: "British Pound" },
  LBP: { symbol: "ل.ل", code: "LBP", name: "Lebanese Pound" },
  AED: { symbol: "د.إ", code: "AED", name: "UAE Dirham" },
  SAR: { symbol: "﷼", code: "SAR", name: "Saudi Riyal" },
  EGP: { symbol: "E£", code: "EGP", name: "Egyptian Pound" },
  JOD: { symbol: "JD", code: "JOD", name: "Jordanian Dinar" },
  KWD: { symbol: "KD", code: "KWD", name: "Kuwaiti Dinar" },
  QAR: { symbol: "QR", code: "QAR", name: "Qatari Riyal" },
  TRY: { symbol: "₺", code: "TRY", name: "Turkish Lira" },
  CAD: { symbol: "CA$", code: "CAD", name: "Canadian Dollar" },
  AUD: { symbol: "A$", code: "AUD", name: "Australian Dollar" },
};

export type CurrencyCode = keyof typeof CURRENCIES;

export function getCurrencySymbol(currency?: string | null): string {
  if (!currency) return "$";
  const c = CURRENCIES[currency.toUpperCase()];
  return c?.symbol ?? currency;
}

export function formatCurrency(
  amount: number | string,
  currency?: string | null,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const num = Number(amount);
  if (Number.isNaN(num)) return "0.00";
  const code = currency ?? "USD";
  const c = CURRENCIES[code.toUpperCase()];
  const symbol = c?.symbol ?? code;
  const formatted = num.toLocaleString("en", {
    minimumFractionDigits: options?.minimumFractionDigits ?? 2,
    maximumFractionDigits: options?.maximumFractionDigits ?? 2,
  });
  if (["LBP", "SAR", "AED", "JOD", "KWD", "QAR", "EGP"].includes(code.toUpperCase())) {
    return `${symbol} ${formatted}`;
  }
  return `${symbol}${formatted}`;
}
