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

export function ProviderReport({ locale }: { locale: string }) {
  const { startDate, endDate, setStartDate, setEndDate } =
    useReportDateRange(3);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/reports/providers?start_date=${startDate}&end_date=${endDate}`,
      { cache: "no-store", credentials: "include" }
    );
    const json = await res.json();
    if (!res.ok || (json as { error?: string }).error) {
      setData(null);
      setLoading(false);
      return;
    }
    setData(json);
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportCSV() {
    const providers = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown> | null)?.providers)
        ? ((data as Record<string, unknown>)?.providers as Record<string, unknown>[])
        : [];
    if (providers.length === 0) return;
    const csv = [
      [
        "Provider",
        "Total Appointments",
        "Completed",
        "Completion %",
        "Revenue",
        "Avg per Appointment",
      ],
      ...providers.map((p) => [
        p.provider_name,
        p.total_appointments,
        p.completed,
        `${Number(p.completion_rate).toFixed(1)}%`,
        `$${Number(p.revenue).toFixed(2)}`,
        `$${Number(p.avg_per_appointment).toFixed(2)}`,
      ]),
    ]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `providers-${startDate}-${endDate}.csv`;
    a.click();
  }

  if (loading) return <ReportSkeleton />;

  if (!data || (data as { error?: string }).error) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="font-medium text-destructive">Failed to load providers report</p>
        <p className="text-sm text-muted-foreground mt-1">
          You may need permission to view reports, or the server could not load data.
        </p>
      </div>
    );
  }

  const providers = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown> | null)?.providers)
      ? ((data as Record<string, unknown>)?.providers as Record<string, unknown>[])
      : [];
  const totalRevenue = providers.reduce(
    (s, p) => s + Number(p.revenue ?? 0),
    0
  );
  const totalAppts = providers.reduce(
    (s, p) => s + Number(p.total_appointments ?? 0),
    0
  );

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

      <KPICards
        cards={[
          { label: "Active Providers", value: providers.length },
          {
            label: "Total Revenue",
            value: `$${totalRevenue.toLocaleString()}`,
            color: "text-green-600",
          },
          { label: "Total Appointments", value: totalAppts },
          {
            label: "Avg Revenue / Provider",
            value:
              providers.length > 0
                ? `$${(totalRevenue / providers.length).toFixed(0)}`
                : "$0",
          },
        ]}
      />

      {providers.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground text-sm">
          No provider data for this period.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4">
                Revenue by Provider
              </h2>
              <BarChart
                rows={providers.map((p) => ({
                  label: (p.provider_name as string).split(" ")[0],
                  value: Number(p.revenue ?? 0),
                }))}
                formatValue={(v) => `$${v.toLocaleString()}`}
              />
            </div>
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold mb-4">
                Appointments by Provider
              </h2>
              <BarChart
                rows={providers.map((p) => ({
                  label: (p.provider_name as string).split(" ")[0],
                  value: Number(p.total_appointments ?? 0),
                  secondaryValue: Number(p.completed ?? 0),
                }))}
                primaryLabel="Total"
                secondaryLabel="Completed"
                formatValue={(v) => String(v)}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-sm font-semibold">
                Provider Performance Detail
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                    Appointments
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                    Completion %
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                    No-Show %
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                    Avg / Appt
                  </th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                    Revenue share
                  </th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p, i) => {
                  const revShare =
                    totalRevenue > 0
                      ? (Number(p.revenue) / totalRevenue) * 100
                      : 0;
                  return (
                    <tr
                      key={i}
                      className="border-b hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {p.provider_name as string}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {p.total_appointments as number}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span
                          className={`font-medium ${Number(p.completion_rate) >= 80 ? "text-green-600" : "text-orange-600"}`}
                        >
                          {Number(p.completion_rate).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span
                          className={
                            Number(p.no_show_rate) > 10
                              ? "text-red-600"
                              : "text-muted-foreground"
                          }
                        >
                          {Number(p.no_show_rate ?? 0).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end font-semibold text-green-600">
                        ${Number(p.revenue).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-end">
                        $
                        {Number(p.avg_per_appointment ?? 0).toFixed(0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${revShare}%`, backgroundColor: "#3b82f6" }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-end">
                            {revShare.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
