"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Download, CheckCircle } from "lucide-react";
import { ReportDatePicker } from "./ReportDatePicker";
import { useReportDateRange } from "./useReportDateRange";

interface UnpaidInvoice {
  id: string;
  invoice_number: string;
  patient: { first_name: string; last_name: string; phone: string };
  total: number;
  balance_due: number;
  days_outstanding: number;
  status: string;
}

interface UnpaidData {
  invoices: UnpaidInvoice[];
  summary: { totalUnpaidAmount: number; totalUnpaidCount: number };
}

export function UnpaidReport({ locale }: { locale: string }) {
  const router = useRouter();
  const { startDate, endDate, setStartDate, setEndDate } =
    useReportDateRange(3);
  const [data, setData] = useState<UnpaidData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<
    "balance_due" | "days_outstanding"
  >("days_outstanding");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/reports/unpaid?start_date=${startDate}&end_date=${endDate}`,
      { cache: "no-store", credentials: "include" }
    );
    const d = await res.json();
    if (!res.ok || (d as { error?: string }).error) {
      setData(null);
      setLoading(false);
      return;
    }
    setData(d);
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportCSV() {
    const invoices = [...(data?.invoices ?? [])].sort((a, b) =>
      sortBy === "balance_due"
        ? b.balance_due - a.balance_due
        : b.days_outstanding - a.days_outstanding
    );
    const csv = [
      ["Invoice #", "Patient", "Status", "Balance Due", "Days Out"],
      ...invoices.map((inv) => [
        inv.invoice_number,
        `${inv.patient?.first_name ?? ""} ${inv.patient?.last_name ?? ""}`.trim(),
        inv.status,
        `$${Number(inv.balance_due).toFixed(2)}`,
        inv.days_outstanding,
      ]),
    ]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `unpaid-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const hasError = !loading && (!data || (data as { error?: string }).error);
  const invoices = [...(data?.invoices ?? [])].sort((a, b) =>
    sortBy === "balance_due"
      ? b.balance_due - a.balance_due
      : b.days_outstanding - a.days_outstanding
  );
  const buckets = [
    {
      label: "< 30 days",
      color: "bg-green-100 text-green-700",
      filter: (i: UnpaidInvoice) => i.days_outstanding < 30,
    },
    {
      label: "30–60 days",
      color: "bg-orange-100 text-orange-700",
      filter: (i: UnpaidInvoice) =>
        i.days_outstanding >= 30 && i.days_outstanding < 60,
    },
    {
      label: "60–90 days",
      color: "bg-red-100 text-red-700",
      filter: (i: UnpaidInvoice) =>
        i.days_outstanding >= 60 && i.days_outstanding < 90,
    },
    {
      label: "> 90 days",
      color: "bg-red-200 text-red-800",
      filter: (i: UnpaidInvoice) => i.days_outstanding >= 90,
    },
  ].map((b) => ({
    ...b,
    count: invoices.filter(b.filter).length,
    amount: invoices.filter(b.filter).reduce((s, i) => s + i.balance_due, 0),
  }));

  function getDaysColor(days: number) {
    if (days < 30) return "text-green-600";
    if (days < 60) return "text-orange-600";
    return "text-red-600";
  }

  function getAgingLabel(days: number) {
    if (days < 30) return { label: "< 30 days", color: "bg-green-100 text-green-700" };
    if (days < 60) return { label: "30–60 days", color: "bg-orange-100 text-orange-700" };
    if (days < 90) return { label: "60–90 days", color: "bg-red-100 text-red-700" };
    return { label: "> 90 days", color: "bg-red-200 text-red-800" };
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <ReportDatePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
        />
        <button
          onClick={exportCSV}
          disabled={loading || !data?.invoices?.length}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download className="size-3.5 inline-block" />
          Export CSV
        </button>
      </div>

      {hasError ? (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load unpaid report</p>
          <p className="text-sm text-muted-foreground mt-1">
            You may need permission to view reports, or the server could not load data.
          </p>
        </div>
      ) : loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Total Outstanding</p>
          <p className="text-3xl font-bold mt-1 text-orange-600">
            $
            {Number(data?.summary?.totalUnpaidAmount ?? 0).toLocaleString("en", {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.summary?.totalUnpaidCount ?? 0} unpaid invoices
          </p>
        </div>
        {buckets.slice(0, 2).map((b) => (
          <div key={b.label} className="rounded-xl border bg-card p-5">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.color}`}
            >
              {b.label}
            </span>
            <p className="text-xl font-bold mt-2">
              ${Number(b.amount).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">{b.count} invoices</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {buckets.map((b) => (
          <div
            key={b.label}
            className="rounded-xl border bg-card p-4 text-center"
          >
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.color}`}
            >
              {b.label}
            </span>
            <p className="text-2xl font-bold mt-2">{b.count}</p>
            <p className="text-sm text-muted-foreground">
              ${Number(b.amount).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        <div className="flex rounded-lg border overflow-hidden">
          {(["days_outstanding", "balance_due"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                sortBy === s
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {invoices.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle className="size-12 mx-auto mb-3 text-green-600" />
            <p className="font-semibold">All invoices are paid</p>
            <p className="text-sm text-muted-foreground mt-1">
              No outstanding balances
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  Invoice
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  Patient
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Balance Due
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Days Out
                </th>
                <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                  Aging
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const aging = getAgingLabel(inv.days_outstanding);
                return (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/${locale}/billing/${inv.id}`)}
                    className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {inv.patient?.first_name} {inv.patient?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.patient?.phone}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          inv.status === "partially_paid"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {inv.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end font-bold text-orange-600">
                      ${Number(inv.balance_due).toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-3 text-end font-medium ${getDaysColor(inv.days_outstanding)}`}
                    >
                      {inv.days_outstanding}d
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${aging.color}`}
                      >
                        {aging.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </div>
  );
}
