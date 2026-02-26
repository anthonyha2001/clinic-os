"use client";

import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { useReportDateRange } from "./useReportDateRange";
import { ReportDatePicker } from "./ReportDatePicker";
import { KPICards } from "./KPICards";
import { BarChart } from "./BarChart";

type GroupBy = "day" | "week" | "month";

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

export function RevenueReport({ locale }: { locale: string }) {
  const { startDate, endDate, setStartDate, setEndDate, prevStart } =
    useReportDateRange(6);
  const [groupBy, setGroupBy] = useState<GroupBy>("month");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [prevData, setPrevData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const prev = prevStart();
    const opts = { cache: "no-store" as RequestCache, credentials: "include" as RequestCredentials };
    const [currRes, prevRes] = await Promise.all([
      fetch(
        `/api/reports/revenue?group_by=${groupBy}&start_date=${startDate}&end_date=${endDate}`,
        opts
      ),
      fetch(
        `/api/reports/revenue?group_by=${groupBy}&start_date=${prev.start}&end_date=${prev.end}`,
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
    if (!prevRes.ok || (previous as { error?: string }).error) {
      setPrevData(null);
    } else {
      setPrevData(previous);
    }
    setData(curr);
    setLoading(false);
  }, [groupBy, startDate, endDate, prevStart]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportCSV() {
    const periods = (data?.periods as Record<string, unknown>[]) ?? [];
    const csv = [
      ["Period", "Revenue", "Payments"],
      ...periods.map((p) => [
        p.period,
        `$${Number(p.total_revenue).toFixed(2)}`,
        p.payment_count,
      ]),
    ]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `revenue-${startDate}-${endDate}.csv`;
    a.click();
  }

  const currTotal = Number(
    (data?.summary as Record<string, unknown>)?.total_revenue ?? 0
  );
  const prevTotal = Number(
    (prevData?.summary as Record<string, unknown>)?.total_revenue ?? 0
  );
  const trend =
    prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : 0;
  const currPayments = Number(
    (data?.summary as Record<string, unknown>)?.total_payments ?? 0
  );
  const prevPayments = Number(
    (prevData?.summary as Record<string, unknown>)?.total_payments ?? 0
  );
  const paymentTrend =
    prevPayments > 0 ? ((currPayments - prevPayments) / prevPayments) * 100 : 0;
  const avgPayment = currPayments > 0 ? currTotal / currPayments : 0;
  const prevAvg = prevPayments > 0 ? prevTotal / prevPayments : 0;
  const avgTrend = prevAvg > 0 ? ((avgPayment - prevAvg) / prevAvg) * 100 : 0;

  const periods = (data?.periods as Record<string, unknown>[]) ?? [];
  const prevPeriods = (prevData?.periods as Record<string, unknown>[]) ?? [];

  if (!data) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="font-medium text-destructive">Failed to load revenue report</p>
        <p className="text-sm text-muted-foreground mt-1">
          You may need permission to view reports, or the server could not load data.
        </p>
      </div>
    );
  }

  const chartRows = periods.map((p, i) => ({
    label: p.period as string,
    value: Number(p.total_revenue),
    secondaryValue: prevPeriods[i]
      ? Number(prevPeriods[i].total_revenue)
      : undefined,
  }));

  if (loading) return <ReportSkeleton />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ReportDatePicker
            startDate={startDate}
            endDate={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
          <div className="flex rounded-lg border overflow-hidden">
            {(["day", "week", "month"] as GroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${groupBy === g ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Download className="size-3.5 inline-block" />
          Export CSV
        </button>
      </div>

      <KPICards
        cards={[
          {
            label: "Total Revenue",
            value: `$${currTotal.toLocaleString("en", { minimumFractionDigits: 2 })}`,
            color: "text-green-600",
            trend: { value: trend, label: "vs prev period" },
          },
          {
            label: "Total Payments",
            value: currPayments,
            trend: { value: paymentTrend, label: "vs prev period" },
          },
          {
            label: "Avg per Payment",
            value: `$${avgPayment.toFixed(2)}`,
            trend: { value: avgTrend, label: "vs prev period" },
          },
          {
            label: "Periods",
            value: periods.length,
            sub: `${groupBy}ly breakdown`,
          },
        ]}
      />

      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4">
          Revenue by {groupBy}
        </h2>
        {periods.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            No revenue data for this period.
          </p>
        ) : (
          <BarChart
            rows={chartRows}
            primaryLabel="Current period"
            secondaryLabel="Previous period"
            formatValue={(v) => `$${v.toLocaleString()}`}
            height={36}
            multiColor={periods.length <= 6}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {[
          {
            title: "By Provider",
            rows: (data?.by_provider as Record<string, unknown>[]) ?? [],
            keyField: "provider_name",
          },
          {
            title: "By Service",
            rows: (data?.by_service as Record<string, unknown>[]) ?? [],
            keyField: "service_name",
          },
          {
            title: "By Payment Method",
            rows: (data?.by_payment_method as Record<string, unknown>[]) ?? [],
            keyField: "method",
          },
        ].map(({ title, rows, keyField }) => (
          <div key={title} className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold">{title}</h3>
            </div>
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                No data
              </p>
            ) : (
              <div className="divide-y">
                {rows.slice(0, 8).map((row, i) => {
                  const total = rows.reduce(
                    (s, r) => s + Number(r.total_revenue),
                    0
                  );
                  const pct =
                    total > 0
                      ? (Number(row.total_revenue) / total) * 100
                      : 0;
                  return (
                    <div key={i} className="px-4 py-2.5">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground truncate capitalize">
                          {(row[keyField] as string)?.replace("_", " ")}
                        </span>
                        <span className="font-medium shrink-0 ms-2">
                          $
                          {Number(row.total_revenue).toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: "#3b82f6" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
