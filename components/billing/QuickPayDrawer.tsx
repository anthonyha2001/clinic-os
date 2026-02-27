"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useCurrency } from "@/lib/context/CurrencyContext";

type Invoice = {
  id: string;
  invoice_number: string;
  total: number;
  balance_due: number;
  patient_id?: string;
  patient?: { first_name: string; last_name: string };
};

type PaymentMethod = { id: string; label_en: string; type?: string };

export function QuickPayDrawer({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { format, symbol } = useCurrency();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [form, setForm] = useState({
    payment_method_id: "",
    amount: Number(invoice.balance_due ?? invoice.total).toFixed(2),
    reference_number: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/payment-methods")
      .then((r) => r.json())
      .then((d) => {
        const raw = d.paymentMethods ?? d.payment_methods ?? d ?? [];
        const ms: PaymentMethod[] = Array.isArray(raw)
          ? raw.map((m: Record<string, unknown>) => ({
              id: m.id as string,
              label_en: (m.label_en ?? m.labelEn) as string,
              type: m.type as string | undefined,
            }))
          : [];
        setMethods(ms);
        if (ms.length > 0)
          setForm((f) => ({ ...f, payment_method_id: ms[0].id }));
      });
  }, []);

  async function handleSubmit() {
    if (!form.payment_method_id) {
      setError("Select a payment method");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!invoice.patient_id) {
      setError("Invoice has no patient.");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: invoice.patient_id,
        payment_method_id: form.payment_method_id,
        amount: Number(form.amount),
        reference_number: form.reference_number || undefined,
        notes: form.notes || undefined,
        allocations: [
          { invoice_id: invoice.id, amount: Number(form.amount) },
        ],
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.message ?? "Failed to record payment.");
      setLoading(false);
      return;
    }
    onSuccess();
  }

  const balanceDue = Number(invoice.balance_due ?? invoice.total);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 end-0 z-50 w-full max-w-md bg-card shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">Record Payment</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {invoice.invoice_number} · {invoice.patient?.first_name}{" "}
              {invoice.patient?.last_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Invoice Total</span>
              <span>{format(invoice.total)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold mt-1">
              <span className="text-orange-700 dark:text-orange-400">Balance Due</span>
              <span className="text-orange-700 dark:text-orange-400">
                {format(balanceDue)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {symbol}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={balanceDue}
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
                className="w-full rounded-lg border px-3 py-2 ps-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
              />
            </div>
            {Number(form.amount) < balanceDue && Number(form.amount) > 0 && (
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                Partial payment — {format(balanceDue - Number(form.amount))} will remain
                outstanding
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(Array.isArray(methods) ? methods : []).map((m) => (
                <button
                  key={m.id}
                  onClick={() =>
                    setForm((f) => ({ ...f, payment_method_id: m.id }))
                  }
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.payment_method_id === m.id
                      ? "border-primary bg-primary/5 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {m.label_en}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Reference Number (optional)
            </label>
            <input
              type="text"
              value={form.reference_number}
              onChange={(e) =>
                setForm((f) => ({ ...f, reference_number: e.target.value }))
              }
              placeholder="Card / bank reference..."
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Notes (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background resize-none"
            />
          </div>
        </div>

        <div className="border-t px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loading
              ? "Recording..."
              : `Record ${format(form.amount)}`}
          </button>
        </div>
      </div>
    </>
  );
}
