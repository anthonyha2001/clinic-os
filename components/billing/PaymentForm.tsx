"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useCurrency } from "@/lib/context/CurrencyContext";

interface PaymentMethod {
  id: string;
  label_en?: string;
  labelEn?: string;
}

interface InvoiceForPayment {
  id: string;
  patient_id: string;
  invoice_number: string;
  balance_due?: string | number;
  total: string | number;
}

interface PaymentFormProps {
  invoice: InvoiceForPayment;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentForm({ invoice, onClose, onSuccess }: PaymentFormProps) {
  const { format } = useCurrency();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [form, setForm] = useState({
    payment_method_id: "",
    amount: String(
      Number(invoice.balance_due ?? invoice.total).toFixed(2)
    ),
    reference_number: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/payment-methods", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const ms = d.paymentMethods ?? d.payment_methods ?? (Array.isArray(d) ? d : []);
        setMethods(ms);
        if (ms.length > 0 && !form.payment_method_id) {
          setForm((f) => ({ ...f, payment_method_id: ms[0].id }));
        }
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

    setLoading(true);
    setError(null);

    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: invoice.patient_id,
        payment_method_id: form.payment_method_id,
        amount: Number(form.amount),
        reference_number: form.reference_number || null,
        notes: form.notes || null,
        allocations: [{ invoice_id: invoice.id, amount: Number(form.amount) }],
      }),
      credentials: "include",
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? data.message ?? "Failed to record payment.");
      setLoading(false);
      return;
    }

    onSuccess();
  }

  const label = (m: PaymentMethod) => m.label_en ?? m.labelEn ?? m.id;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Record Payment</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-1 rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="font-medium">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Balance Due</span>
              <span className="font-bold text-orange-600 dark:text-orange-400">
                {format(invoice.balance_due ?? invoice.total)}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Payment Method
            </label>
            <select
              value={form.payment_method_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, payment_method_id: e.target.value }))
              }
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select method...</option>
              {(Array.isArray(methods) ? methods : []).map((m) => (
                <option key={m.id} value={m.id}>
                  {label(m)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount: e.target.value }))
              }
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Reference Number (optional)
            </label>
            <input
              type="text"
              value={form.reference_number}
              onChange={(e) =>
                setForm((f) => ({ ...f, reference_number: e.target.value }))
              }
              placeholder="Card/bank reference..."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Notes (optional)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? "Recording..." : "Record Payment"}
          </button>
        </div>
      </div>
    </>
  );
}
