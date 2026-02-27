"use client";

import { useCurrency } from "@/lib/context/CurrencyContext";

import { useState, useEffect, useRef } from "react";
import { Printer, X, Check } from "lucide-react";

type InvoiceDetail = {
  id: string;
  invoice_number: string;
  status: string;
  subtotal?: number;
  discount_percent?: number;
  discount_amount?: number;
  total: number;
  balance_due: number;
  notes?: string;
  created_at: string;
  patient?: {
    first_name: string;
    last_name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  lines?: {
    id: string;
    description_en: string;
    quantity: number;
    unit_price: number;
    line_total?: number;
  }[];
  payments?: {
    id: string;
    amount: number;
    payment_method?: { label_en?: string; type?: string };
    created_at: string;
  }[];
};

export function InvoicePrintPreview({
  invoiceId,
  onClose,
}: {
  invoiceId: string;
  onClose: () => void;
}) {
  const { format } = useCurrency();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/invoices/${invoiceId}`)
      .then((r) => r.json())
      .then((d) => {
        setInvoice(d.invoice ?? d);
        setLoading(false);
      });
  }, [invoiceId]);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Invoice ${invoice?.invoice_number ?? ""}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #111; padding: 40px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
            .clinic-name { font-size: 22px; font-weight: 700; }
            .invoice-title { font-size: 18px; font-weight: 600; color: #6b7280; }
            .invoice-number { font-size: 24px; font-weight: 700; }
            .section { margin-bottom: 24px; }
            .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            th { text-align: left; padding: 8px 12px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 11px; text-transform: uppercase; color: #6b7280; }
            td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; }
            .text-right { text-align: right; }
            .totals { width: 280px; margin-left: auto; }
            .totals tr td { padding: 4px 8px; }
            .totals .total-row { font-weight: 700; font-size: 14px; border-top: 2px solid #e5e7eb; }
            .balance { color: #ea580c; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500; background: #f0fdf4; color: #16a34a; }
            .paid { background: #f0fdf4; color: #16a34a; }
            .issued { background: #fefce8; color: #ca8a04; }
            .partially_paid { background: #fff7ed; color: #ea580c; }
            .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 11px; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }

  if (!invoice && !loading) {
    return null;
  }

  const subtotal =
    invoice?.subtotal ??
    (Number(invoice?.total ?? 0) + Number(invoice?.discount_amount ?? 0));
  const linesWithTotal = (invoice?.lines ?? []).map((line) => ({
    ...line,
    description_en:
      line.description_en ?? (line as Record<string, string>).descriptionEn ?? "",
    line_total:
      line.line_total ??
      Number(line.quantity) * Number(line.unit_price),
  }));

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-4 lg:inset-12 z-50 bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h2 className="text-lg font-semibold">Invoice Preview</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Printer className="size-4 inline-block" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-gray-100">
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-32 bg-muted rounded-xl" />
              <div className="h-64 bg-muted rounded-xl" />
            </div>
          ) : !invoice ? (
            <p className="text-center text-muted-foreground">
              Invoice not found.
            </p>
          ) : (
            <div
              ref={printRef}
              className="bg-white rounded-xl shadow-sm max-w-2xl mx-auto p-10 space-y-8"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-2xl font-bold">Clinic OS</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Medical Clinic Management
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-sm text-gray-500 invoice-title">INVOICE</p>
                  <p className="text-2xl font-bold invoice-number">
                    {invoice.invoice_number}
                  </p>
                  <span
                    className={`inline-block mt-1 rounded-full px-3 py-0.5 text-xs font-medium badge ${invoice.status}`}
                  >
                    {invoice.status.replace("_", " ")}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-2 section-title">
                    Bill To
                  </p>
                  <p className="font-semibold">
                    {invoice.patient?.first_name} {invoice.patient?.last_name}
                  </p>
                  {invoice.patient?.phone && (
                    <p className="text-sm text-gray-500">
                      {invoice.patient.phone}
                    </p>
                  )}
                  {invoice.patient?.email && (
                    <p className="text-sm text-gray-500">
                      {invoice.patient.email}
                    </p>
                  )}
                  {invoice.patient?.address && (
                    <p className="text-sm text-gray-500">
                      {invoice.patient.address}
                    </p>
                  )}
                </div>
                <div className="text-end">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-2 section-title">
                    Invoice Date
                  </p>
                  <p className="font-semibold">
                    {new Date(invoice.created_at).toLocaleDateString("en", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="py-2 text-start text-xs uppercase tracking-wide text-gray-400">
                        Description
                      </th>
                      <th className="py-2 text-end text-xs uppercase tracking-wide text-gray-400">
                        Qty
                      </th>
                      <th className="py-2 text-end text-xs uppercase tracking-wide text-gray-400">
                        Unit Price
                      </th>
                      <th className="py-2 text-end text-xs uppercase tracking-wide text-gray-400">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linesWithTotal.map((line) => (
                      <tr
                        key={line.id}
                        className="border-b border-gray-100"
                      >
                        <td className="py-3">{line.description_en}</td>
                        <td className="py-3 text-end text-gray-500">
                          {line.quantity}
                        </td>
                        <td className="py-3 text-end text-gray-500">
                          {format(line.unit_price)}
                        </td>
                        <td className="py-3 text-end font-medium">
                          {format(line.line_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <div className="w-64 space-y-1 text-sm totals">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Subtotal</span>
                    <span>{format(subtotal)}</span>
                  </div>
                  {Number(invoice.discount_amount) > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>
                        Discount ({invoice.discount_percent}%)
                      </span>
                      <span>
                        -{format(invoice.discount_amount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200 total-row">
                    <span>Total</span>
                    <span>{format(invoice.total)}</span>
                  </div>
                  {Number(invoice.balance_due) > 0 && (
                    <div className="flex justify-between font-bold text-orange-600 balance">
                      <span>Balance Due</span>
                      <span>
                        {format(invoice.balance_due)}
                      </span>
                    </div>
                  )}
                  {Number(invoice.balance_due) === 0 && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>Paid in Full</span>
                      <Check className="size-4 inline-block" />
                    </div>
                  )}
                </div>
              </div>

              {(invoice.payments ?? []).length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-3 section-title">
                    Payment History
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="py-2 text-start text-xs text-gray-400">
                          Date
                        </th>
                        <th className="py-2 text-start text-xs text-gray-400">
                          Method
                        </th>
                        <th className="py-2 text-end text-xs text-gray-400">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.payments!.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-gray-50"
                        >
                          <td className="py-2 text-gray-500">
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-2 text-gray-500">
                            {p.payment_method?.label_en ??
                              p.payment_method?.type ??
                              "—"}
                          </td>
                          <td className="py-2 text-end font-medium">
                            {format(p.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {invoice.notes && (
                <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1 section-title">
                    Notes
                  </p>
                  <p>{invoice.notes}</p>
                </div>
              )}

              <div className="pt-6 border-t border-gray-100 text-center text-xs text-gray-400 footer">
                <p>
                  Thank you for your trust. Please contact us if you have any
                  questions.
                </p>
                <p className="mt-1">
                  Generated by Clinic OS · {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
