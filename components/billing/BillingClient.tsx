"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Printer, FileText } from "lucide-react";
import { useCurrency } from "@/lib/context/CurrencyContext";
import { QuickPayDrawer } from "./QuickPayDrawer";
import { InvoicePrintPreview } from "./InvoicePrintPreview";
import { SearchInput } from "@/components/ui/SearchInput";
import { useFetch } from "@/hooks/useFetch";
import { apiCache } from "@/lib/cache/apiCache";

const STATUS_COLORS: Record<string, string> = {
  draft: "app-badge app-badge-neutral",
  issued: "app-badge app-badge-medium",
  partially_paid: "app-badge app-badge-medium",
  paid: "app-badge app-badge-low",
  voided: "app-badge app-badge-high",
};

const STATUS_OPTIONS = [
  "all",
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "voided",
] as const;

const PAGE_SIZE = 50;

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  balance_due: number;
  created_at: string;
  patient_id?: string;
  patient?: { first_name: string; last_name: string; phone: string };
  provider?: { user?: { full_name?: string }; full_name?: string };
};

export function BillingClient({
  locale,
  hideFinancialSummary = false,
}: {
  locale: string;
  hideFinancialSummary?: boolean;
}) {
  const router = useRouter();
  const { format } = useCurrency();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [providers, setProviders] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState({
    totalUnpaidAmount: 0,
    totalUnpaidCount: 0,
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const [quickPayInvoice, setQuickPayInvoice] = useState<Invoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  const invoiceUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (providerFilter !== "all") params.set("provider_id", providerFilter);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    return `/api/invoices?${params.toString()}`;
  }, [statusFilter, providerFilter, startDate, endDate]);

  const {
    data: invoicesData,
    loading,
    refetch: refetchInvoices,
  } = useFetch<Invoice[] | { invoices?: Invoice[] }>(invoiceUrl, {
    ttl: 30_000,
    initialData: [],
  });
  const { data: unpaidData } = useFetch<{
    summary?: { totalUnpaidAmount?: number; totalUnpaidCount?: number };
  }>("/api/reports/unpaid", { ttl: 30_000, initialData: { summary: {} } });
  const { data: providersData } = useFetch<
    Record<string, unknown>[] | { providers?: Record<string, unknown>[] }
  >("/api/providers", { ttl: 300_000, initialData: [] });

  useEffect(() => {
    const rawInvoices = Array.isArray(invoicesData)
      ? invoicesData
      : invoicesData?.invoices ?? [];
    setInvoices(Array.isArray(rawInvoices) ? rawInvoices : []);
    setPage(1);
  }, [invoicesData]);

  useEffect(() => {
    setSummary({
      totalUnpaidAmount: unpaidData?.summary?.totalUnpaidAmount ?? 0,
      totalUnpaidCount: unpaidData?.summary?.totalUnpaidCount ?? 0,
    });
  }, [unpaidData]);

  useEffect(() => {
    const raw = Array.isArray(providersData)
      ? providersData
      : providersData?.providers ?? [];
    setProviders(Array.isArray(raw) ? raw : []);
  }, [providersData]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.patient?.first_name?.toLowerCase().includes(q) ||
      inv.patient?.last_name?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((i) => i.id)));
    }
  }

  async function bulkVoid() {
    if (selectedIds.size === 0) return;
    const confirm = window.confirm(`Void ${selectedIds.size} invoice(s)?`);
    if (!confirm) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/invoices/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "voided" }),
        })
      )
    );
    setSelectedIds(new Set());
    setBulkLoading(false);
    apiCache.invalidate("/api/invoices?");
    apiCache.invalidate("/api/reports/unpaid");
    refetchInvoices();
  }

  function exportCSV() {
    const ids = Array.from(selectedIds);
    const rows = filtered
      .filter((inv) => ids.length === 0 || ids.includes(inv.id))
      .map((inv) => [
        inv.invoice_number,
        `${inv.patient?.first_name ?? ""} ${inv.patient?.last_name ?? ""}`.trim(),
        new Date(inv.created_at).toLocaleDateString(),
        format(inv.total),
        format(inv.balance_due),
        inv.status,
      ]);

    const csv = [
      ["Invoice #", "Patient", "Date", "Total", "Balance Due", "Status"],
      ...rows,
    ]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function isOverdue(inv: Invoice) {
    if (!["issued", "partially_paid"].includes(inv.status)) return false;
    const days =
      (Date.now() - new Date(inv.created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    return days > 30;
  }

  const hasActiveFilters =
    statusFilter !== "all" ||
    providerFilter !== "all" ||
    startDate ||
    endDate ||
    search;

  return (
    <div className="space-y-5">
      <div className="list-page-header">
        <div>
          <h1 className="list-page-title">Billing</h1>
          {!hideFinancialSummary && (
            <p className="list-page-subtitle">
              {summary.totalUnpaidCount} unpaid &middot;{" "}
              <span className="text-orange-600 font-medium">
                {format(summary.totalUnpaidAmount)}
              </span>{" "}
              outstanding
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="app-btn-secondary flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Download className="size-4 inline-block" />
            Export CSV
          </button>
          <button
            onClick={() => router.push(`/${locale}/billing/new`)}
            className="app-btn-primary flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="size-4 inline-block" />
            New Invoice
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_OPTIONS.map((status) => {
          const count =
            status === "all"
              ? invoices.length
              : invoices.filter((i) => i.status === status).length;
          const amount =
            status === "all"
              ? null
              : invoices
                  .filter((i) => i.status === status)
                  .reduce((s, i) => s + Number(i.balance_due ?? i.total), 0);
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-xl border p-3 text-start transition-colors hover:bg-muted/50 ${
                statusFilter === status
                  ? "border-primary bg-primary/5"
                  : "bg-card"
              }`}
            >
              <p className="text-xl font-bold">{count}</p>
              <span
                className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  status === "all"
                    ? "bg-gray-100 text-gray-600"
                    : STATUS_COLORS[status]
                }`}
              >
                {status.replace("_", " ")}
              </span>
              {amount != null && amount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {format(amount)}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search invoice # or patient..."
          className="w-64"
        />
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All Providers</option>
          {(Array.isArray(providers) ? providers : []).map((p) => (
            <option key={p.id as string} value={p.id as string}>
              {(p.user as Record<string, string> | undefined)?.full_name ??
                (p.full_name as string)}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setProviderFilter("all");
              setStartDate("");
              setEndDate("");
              setSearch("");
            }}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border bg-primary/5 border-primary/20 px-4 py-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <button
            onClick={exportCSV}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted flex items-center gap-1.5"
          >
            <Download className="size-3.5 inline-block" />
            Export selected
          </button>
          <button
            onClick={bulkVoid}
            disabled={bulkLoading}
            className="rounded-lg border border-red-200 text-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
          >
            {bulkLoading ? "Voiding..." : "Void selected"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground ms-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="app-table-wrap">
        <table className="app-table text-sm">
          <thead>
            <tr>
              <th className="px-5 py-3 w-10">
                <input
                  type="checkbox"
                  checked={
                    selectedIds.size === filtered.length && filtered.length > 0
                  }
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-5 py-3 text-start">Invoice</th>
              <th className="px-5 py-3 text-start">Patient</th>
              <th className="px-5 py-3 text-start">Provider</th>
              <th className="px-5 py-3 text-start">Date</th>
              <th className="px-5 py-3 text-end">Total</th>
              <th className="px-5 py-3 text-end">Balance</th>
              <th className="px-5 py-3 text-start">Status</th>
              <th className="px-5 py-3 text-start">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {[...Array(9)].map((__, j) => (
                    <td key={j} className="px-5 py-3.5">
                      <div className="h-4 bg-muted rounded w-20" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <FileText className="size-6 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground font-medium">
                      {hasActiveFilters
                        ? "No invoices match your filters."
                        : "No invoices yet."}
                    </p>
                    {!hasActiveFilters && (
                      <button
                        onClick={() => router.push(`/${locale}/billing/new`)}
                        className="app-btn-primary flex items-center gap-1.5 px-4 py-2 text-sm font-medium"
                      >
                        <Plus className="size-4" />
                        Create your first invoice
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((inv) => {
                const overdue = isOverdue(inv);
                const providerName =
                  inv.provider?.user?.full_name ??
                  inv.provider?.full_name ??
                  "\u2014";
                return (
                  <tr
                    key={inv.id}
                    className={`border-b transition-colors ${
                      overdue
                        ? "bg-orange-50/40 dark:bg-orange-950/10"
                        : "hover:bg-muted/30"
                    } ${selectedIds.has(inv.id) ? "bg-primary/5" : ""}`}
                  >
                    <td
                      className="px-5 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
                        className="rounded"
                      />
                    </td>
                    <td
                      className="px-5 py-3.5 cursor-pointer"
                      onClick={() =>
                        router.push(`/${locale}/billing/${inv.id}`)
                      }
                    >
                      <p className="font-medium text-primary hover:underline">
                        {inv.invoice_number}
                      </p>
                      {overdue && (
                        <span className="text-xs text-orange-600 font-medium">
                          &#9888; Overdue
                        </span>
                      )}
                    </td>
                    <td
                      className="px-5 py-3.5 cursor-pointer"
                      onClick={() =>
                        router.push(`/${locale}/billing/${inv.id}`)
                      }
                    >
                      <p className="font-medium">
                        {inv.patient?.first_name} {inv.patient?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.patient?.phone}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {providerName}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs">
                      {new Date(inv.created_at).toLocaleDateString(locale, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-end">{format(inv.total)}</td>
                    <td
                      className={`px-5 py-3.5 text-end font-semibold ${
                        Number(inv.balance_due) > 0
                          ? "text-orange-600"
                          : "text-green-600"
                      }`}
                    >
                      {format(inv.balance_due)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`${
                          STATUS_COLORS[inv.status] ?? "app-badge app-badge-neutral"
                        }`}
                      >
                        {inv.status.replace("_", " ")}
                      </span>
                    </td>
                    <td
                      className="px-5 py-3.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5">
                        {["issued", "partially_paid"].includes(inv.status) && (
                          <button
                            onClick={() => setQuickPayInvoice(inv)}
                            className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 transition-colors"
                          >
                            Pay
                          </button>
                        )}
                        <button
                          onClick={() => setPrintInvoice(inv)}
                          className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                        >
                          <Printer className="size-4 inline-block" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t bg-muted/30 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {filtered.length} invoices
              {totalPages > 1 &&
                ` — page ${page} of ${totalPages}`}
            </span>
            <div className="flex items-center gap-4">
              <div className="flex gap-6">
                <span>
                  Total:{" "}
                  <span className="font-semibold">
                    {format(
                      filtered.reduce((s, i) => s + Number(i.total), 0)
                    )}
                  </span>
                </span>
                <span>
                  Outstanding:{" "}
                  <span className="font-semibold text-orange-600">
                    {format(
                      filtered.reduce((s, i) => s + Number(i.balance_due), 0)
                    )}
                  </span>
                </span>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {quickPayInvoice && (
        <QuickPayDrawer
          invoice={quickPayInvoice}
          onClose={() => setQuickPayInvoice(null)}
          onSuccess={() => {
            setQuickPayInvoice(null);
            apiCache.invalidate("/api/invoices?");
            apiCache.invalidate("/api/reports/unpaid");
            refetchInvoices();
          }}
        />
      )}

      {printInvoice && (
        <InvoicePrintPreview
          invoiceId={printInvoice.id}
          onClose={() => setPrintInvoice(null)}
        />
      )}
    </div>
  );
}