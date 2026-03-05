"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  formatCurrency as formatCurrencyUtil,
  getCurrencySymbol,
} from "@/lib/currency";

type CurrencyContextValue = {
  currency: string;
  symbol: string;
  format: (amount: number | string, options?: { minimumFractionDigits?: number }) => string;
};

const defaultCurrency = "USD";
const defaultSymbol = "$";

const defaultFormat = (a: number | string, opts?: { minimumFractionDigits?: number }) =>
  formatCurrencyUtil(Number(a), defaultCurrency, opts);

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: defaultCurrency,
  symbol: defaultSymbol,
  format: defaultFormat,
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<string>(defaultCurrency);

  const refreshCurrency = useCallback(() => {
    fetch("/api/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const c = d?.currency ?? defaultCurrency;
        setCurrency(typeof c === "string" ? c : defaultCurrency);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCurrency();

    const onCurrencyUpdated = (event: Event) => {
      const nextCurrency = (event as CustomEvent<{ currency?: string }>).detail?.currency;
      if (typeof nextCurrency === "string" && nextCurrency) {
        setCurrency(nextCurrency);
        return;
      }
      refreshCurrency();
    };

    window.addEventListener("currency-updated", onCurrencyUpdated);
    return () => window.removeEventListener("currency-updated", onCurrencyUpdated);
  }, [refreshCurrency]);

  const symbol = getCurrencySymbol(currency);

  const format = useCallback(
    (amount: number | string, options?: { minimumFractionDigits?: number }) =>
      formatCurrencyUtil(amount, currency, options),
    [currency]
  );

  return (
    <CurrencyContext.Provider value={{ currency, symbol, format }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    return {
      currency: defaultCurrency,
      symbol: defaultSymbol,
      format: defaultFormat,
    };
  }
  return ctx;
}
