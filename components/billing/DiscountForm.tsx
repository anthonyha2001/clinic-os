"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface InvoiceForDiscount {
  id: string;
  subtotal: string | number;
}

interface DiscountFormProps {
  invoice: InvoiceForDiscount;
  onClose: () => void;
  onSuccess: () => void;
}

export function DiscountForm({ invoice, onClose, onSuccess }: DiscountFormProps) {
  const [form, setForm] = useState({
    type: "percent" as "percent" | "amount",
    discount_percent: "",
    discount_amount: "",
    reason: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!form.reason.trim()) {
      setError("Reason is required");
      return;
    }
    if (form.type === "percent" && !form.discount_percent) {
      setError("Enter discount percentage");
      return;
    }
    if (form.type === "amount" && !form.discount_amount) {
      setError("Enter discount amount");
      return;
    }

    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = { reason: form.reason.trim() };
    if (form.type === "percent") {
      body.discount_percent = Number(form.discount_percent);
    } else {
      body.discount_amount = Number(form.discount_amount);
    }

    const res = await fetch(`/api/invoices/${invoice.id}/discount`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? data.message ?? "Failed to apply discount.");
      setLoading(false);
      return;
    }

    onSuccess();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Apply Discount</h2>
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

          <div className="rounded-lg bg-muted p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">
                ${Number(invoice.subtotal).toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Discount Type
            </label>
            <div className="flex overflow-hidden rounded-lg border">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: "percent" }))}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  form.type === "percent"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                Percentage (%)
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: "amount" }))}
                className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                  form.type === "amount"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                Fixed Amount ($)
              </button>
            </div>
          </div>

          {form.type === "percent" ? (
            <div>
              <label className="mb-1 block text-sm font-medium">
                Discount Percentage
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={form.discount_percent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discount_percent: e.target.value }))
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 pe-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
              {form.discount_percent && (
                <p className="mt-1 text-xs text-muted-foreground">
                  =
                  $
                  {(
                    (Number(invoice.subtotal) * Number(form.discount_percent)) /
                    100
                  ).toFixed(2)}{" "}
                  off
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium">
                Discount Amount
              </label>
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.discount_amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discount_amount: e.target.value }))
                  }
                  className="w-full rounded-lg border bg-background px-3 py-2 ps-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">
              Reason <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.reason}
              onChange={(e) =>
                setForm((f) => ({ ...f, reason: e.target.value }))
              }
              placeholder="e.g. Loyalty discount, Staff discount..."
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Applying..." : "Apply Discount"}
          </button>
        </div>
      </div>
    </>
  );
}
