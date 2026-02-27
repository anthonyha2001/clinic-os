"use client";

import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { useReportDateRange } from "./useReportDateRange";
import { ReportDatePicker } from "./ReportDatePicker";
import { KPICards } from "./KPICards";
import { BarChart } from "./BarChart";

function ReportSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-10 w-96 bg-muted rounded-lg" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-xl" />
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function AppointmentReport({ locale }: { locale: string }) {
  const { startDate, endDate, setStartDate, setEndDate, prevStart } =
    useReportDateRange(3);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [prevData, setPrevData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const prev = prevStart();
    const opts = { cache: "no-store" as RequestCache, credentials: "include" as RequestCredentials };
    const [currRes, prevRes] = await Promise.all([
      fetch(
        `/api/reports/appointments?start_date=${startDate}&end_date=${endDate}`,
        opts
      ),
      fetch(
        `/api/reports/appointments?start_date=${prev.start}&end_date=${prev.end}`,
        opts
      ),
    ]);
    const curr = await currRes.json();
    const previous = await prevRes.json();
    if (!currRes.ok || (curr as { error?: string }).error) {
      setData(null);
      setPrevData(null);
      setLoading(false);
      return;
    }
    setData(curr);
    setPrevData(prevRes.ok && !(previous as { error?: string }).error ? previous : null);
    setLoading(false);
  }, [startDate, endDate, prevStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportCSV() {
    const byStatus = (data?.by_status as Record<string, unknown>[]) ?? [];
    const csv = [
      ["Status", "Count", "Percentage"],
      ...byStatus.map((s) => [
        s.status,
        s.count,
        `${Number(s.percentage).toFixed(1)}%`,
      ]),
    ]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `appointments-${startDate}-${endDate}.csv`;
    a.click();
  }

  const summary = (data?.summary as Record<string, unknown>) ?? {};
  const prevSummary = (prevData?.summary as Record<string, unknown>) ?? {};
  const hasError = !loading && (!data || (data as { error?: string }).error);

  const total = Number(summary.total ?? 0);
  const prevTotal = Number(prevSummary.total ?? 0);
  const totalTrend =
    prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;

  const completionRate = Number(summary.completion_rate ?? 0);
  const prevCompletionRate = Number(prevSummary.completion_rate ?? 0);
  const completionTrend =
    prevCompletionRate > 0 ? completionRate - prevCompletionRate : 0;

  const noShowRate = Number(summary.no_show_rate ?? 0);
  const prevNoShowRate = Number(prevSummary.no_show_rate ?? 0);
  const noShowTrend = prevNoShowRate > 0 ? noShowRate - prevNoShowRate : 0;

  const byStatus = (data?.by_status as Record<string, unknown>[]) ?? [];
  const byHour = (data?.by_hour as Record<string, unknown>[]) ?? [];
  const byProvider = (data?.by_provider as Record<string, unknown>[]) ?? [];

  const STATUS_COLORS: Record<string, string> = {
    completed: "#22c55e",
    confirmed: "#3b82f6",
    scheduled: "#93c5fd",
    canceled: "#ef4444",
    no_show: "#f97316",
  };

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
          className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted flex items-center gap-1.5"
        >
          <Download className="size-3.5 inline-block" />
          Export CSV
        </button>
      </div>

      {hasError ? (
        <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load appointments report</p>
          <p className="text-sm text-muted-foreground mt-1">
            You may need permission to view reports, or the server could not load data.
          </p>
        </div>
      ) : loading ? (
        <ReportSkeleton />
      ) : (
      <>
      <KPICards
        cards={[
          {
            label: "Total Appointments",
            value: total,
            trend: { value: totalTrend, label: "vs prev period" },
          },
          {
            label: "Completion Rate",
            value: `${completionRate.toFixed(1)}%`,
            color:
              completionRate >= 80 ? "text-green-600" : "text-orange-600",
            trend: { value: completionTrend, label: "vs prev period" },
          },
          {
            label: "No-Show Rate",
            value: `${noShowRate.toFixed(1)}%`,
            color: noShowRate > 10 ? "text-red-600" : "text-green-600",
            trend: { value: -noShowTrend, label: "vs prev period" },
          },
          {
            label: "Cancellation Rate",
            value: `${Number(summary.cancellation_rate ?? 0).toFixed(1)}%`,
            color: "text-muted-foreground",
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">By Status</h2>
          {byStatus.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              No data.
            </p>
          ) : (
            <div className="space-y-3">
              {byStatus.map((s) => (
                <div key={s.status as string}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize font-medium">
                      {(s.status as string).replace("_", " ")}
                    </span>
                    <span className="text-muted-foreground">
                      {s.count as number} · {Number(s.percentage).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Number(s.percentage)}%`,
                        backgroundColor:
                          STATUS_COLORS[s.status as string] ?? "#6b7280",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Busiest Hours</h2>
          {byHour.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              No data.
            </p>
          ) : (
            <BarChart
              rows={byHour.map((h) => ({
                label: `${h.hour}:00`,
                value: Number(h.count),
              }))}
              formatValue={(v) => String(v)}
              height={20}
            />
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4">By Provider</h2>
        {byProvider.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            No data.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-start font-medium text-muted-foreground">
                    Provider
                  </th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                    Total
                  </th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                    Completed
                  </th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                    Completion %
                  </th>
                  <th className="px-4 py-2 text-end font-medium text-muted-foreground">
                    No Show
                  </th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium">
                      {row.provider_name as string}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      {row.total as number}
                    </td>
                    <td className="px-4 py-2.5 text-end text-green-600">
                      {row.completed as number}
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      <span
                        className={`font-medium ${Number(row.completion_rate) >= 80 ? "text-green-600" : "text-orange-600"}`}
                      >
                        {Number(row.completion_rate).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-end text-orange-600">
                      {row.no_show as number}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
