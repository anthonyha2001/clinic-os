"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { PaymentForm } from "./PaymentForm";
import { DiscountForm } from "./DiscountForm";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  issued: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  partially_paid: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  voided: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

interface InvoiceLine {
  id: string;
  description_en: string;
  quantity: number;
  unit_price: string | number;
  line_total: string | number;
}

interface InvoicePayment {
  id: string;
  created_at: string;
  payment_method?: { type?: string };
  reference_number?: string;
  amount: string | number;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  patient_id: string;
  patient?: { first_name?: string; last_name?: string; phone?: string };
  status: string;
  subtotal: string | number;
  total: string | number;
  balance_due?: number;
  discount_amount?: string | number;
  discount_percent?: string | number;
  lines?: InvoiceLine[];
  payments?: InvoicePayment[];
}

interface InvoiceDetailClientProps {
  invoiceId: string;
  locale: string;
}

export function InvoiceDetailClient({
  invoiceId,
  locale,
}: InvoiceDetailClientProps) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showDiscountForm, setShowDiscountForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const refreshInvoice = () => {
    return fetch(`/api/invoices/${invoiceId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setInvoice(d.invoice ?? d));
  };

  useEffect(() => {
    refreshInvoice().finally(() => setLoading(false));
  }, [invoiceId]);

  async function handleIssue() {
    setActionLoading(true);
    try {
      await fetch(`/api/invoices/${invoiceId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "issued" }),
        credentials: "include",
      });
      await refreshInvoice();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleVoid() {
    const reason = window.prompt("Enter reason for voiding this invoice:");
    if (!reason?.trim()) return;
    setActionLoading(true);
    try {
      await fetch(`/api/invoices/${invoiceId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "voided", reason: reason.trim() }),
        credentials: "include",
      });
      await refreshInvoice();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
        <div className="h-32 rounded-xl bg-muted" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        Invoice not found.
      </div>
    );
  }

  const balanceDue = Number(invoice.balance_due ?? invoice.total);
  const canIssue = invoice.status === "draft";
  const canVoid = ["issued", "partially_paid"].includes(invoice.status);
  const canPay = ["issued", "partially_paid"].includes(invoice.status);
  const canDiscount = ["draft", "issued"].includes(invoice.status);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 inline-block" />
        Back
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.patient?.first_name} {invoice.patient?.last_name} ·{" "}
            {invoice.patient?.phone}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            STATUS_COLORS[invoice.status] ?? "bg-gray-100"
          }`}
        >
          {invoice.status?.replace("_", " ")}
        </span>
      </div>

      {/* Invoice lines */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Line Items</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                Description
              </th>
              <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                Qty
              </th>
              <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                Unit Price
              </th>
              <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lines ?? []).map((line) => (
              <tr key={line.id} className="border-b">
                <td className="px-4 py-3">{line.description_en}</td>
                <td className="px-4 py-3 text-end">{line.quantity}</td>
                <td className="px-4 py-3 text-end">
                  ${Number(line.unit_price).toFixed(2)}
                </td>
                <td className="px-4 py-3 text-end font-medium">
                  ${Number(line.line_total).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="space-y-2 border-t px-6 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>${Number(invoice.subtotal).toFixed(2)}</span>
          </div>
          {Number(invoice.discount_amount ?? 0) > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>
                Discount ({invoice.discount_percent ?? 0}%)
              </span>
              <span>
                -${Number(invoice.discount_amount).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span>${Number(invoice.total).toFixed(2)}</span>
          </div>
          {balanceDue > 0 && (
            <div className="flex justify-between font-bold text-orange-600">
              <span>Balance Due</span>
              <span>${balanceDue.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payment history */}
      {(invoice.payments ?? []).length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Payment History</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  Method
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  Reference
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {(invoice.payments ?? []).map((payment) => (
                <tr key={payment.id} className="border-b">
                  <td className="px-4 py-3">
                    {new Date(payment.created_at).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {payment.payment_method?.type?.replace("_", " ") ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {payment.reference_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-end font-medium">
                    ${Number(payment.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {canIssue && (
          <button
            type="button"
            onClick={handleIssue}
            disabled={actionLoading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Issue Invoice
          </button>
        )}
        {canPay && (
          <button
            type="button"
            onClick={() => setShowPaymentForm(true)}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            Record Payment
          </button>
        )}
        {canDiscount && (
          <button
            type="button"
            onClick={() => setShowDiscountForm(true)}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            Apply Discount
          </button>
        )}
        {canVoid && (
          <button
            type="button"
            onClick={handleVoid}
            disabled={actionLoading}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Void Invoice
          </button>
        )}
      </div>

      {showPaymentForm && invoice && (
        <PaymentForm
          invoice={invoice}
          onClose={() => setShowPaymentForm(false)}
          onSuccess={() => {
            setShowPaymentForm(false);
            refreshInvoice();
          }}
        />
      )}

      {showDiscountForm && invoice && (
        <DiscountForm
          invoice={invoice}
          onClose={() => setShowDiscountForm(false)}
          onSuccess={() => {
            setShowDiscountForm(false);
            refreshInvoice();
          }}
        />
      )}
    </div>
  );
}
