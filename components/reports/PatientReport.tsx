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

export function PatientReport({ locale }: { locale: string }) {
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
        `/api/reports/patients?start_date=${startDate}&end_date=${endDate}`,
        opts
      ),
      fetch(
        `/api/reports/patients?start_date=${prev.start}&end_date=${prev.end}`,
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
    const newByMonth =
      (data?.new_by_month as Record<string, unknown>[]) ?? [];
    const csv = [
      ["Month", "New Patients", "Returning Patients"],
      ...newByMonth.map((m) => [
        m.month,
        m.new_count,
        m.returning_count,
      ]),
    ]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `patients-${startDate}-${endDate}.csv`;
    a.click();
  }

  const summary = (data?.summary as Record<string, unknown>) ?? {};
  const prevSummary = (prevData?.summary as Record<string, unknown>) ?? {};
  const hasError = !loading && (!data || (data as { error?: string }).error);

  const newPatients = Number(summary.new_patients ?? summary.patients_created_in_range ?? 0);
  const totalPatients = Number(summary.total_patients ?? 0);
  const prevNew = Number(prevSummary.new_patients ?? 0);
  const newTrend =
    prevNew > 0 ? ((newPatients - prevNew) / prevNew) * 100 : 0;

  const returning = Number(summary.returning_patients ?? 0);
  const prevReturning = Number(prevSummary.returning_patients ?? 0);
  const returningTrend =
    prevReturning > 0
      ? ((returning - prevReturning) / prevReturning) * 100
      : 0;

  const retentionRate = Number(summary.retention_rate ?? 0);
  const prevRetention = Number(prevSummary.retention_rate ?? 0);
  const retentionTrend =
    prevRetention > 0 ? retentionRate - prevRetention : 0;

  const inactive = Number(summary.inactive_patients ?? 0);
  const newByMonth =
    (data?.new_by_month as Record<string, unknown>[]) ?? [];
  const byGender = (data?.by_gender as Record<string, unknown>[]) ?? [];
  const byAgeGroup = (data?.by_age_group as Record<string, unknown>[]) ?? [];

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
          <p className="font-medium text-destructive">Failed to load patients report</p>
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
            label: "Total Patients",
            value: totalPatients,
            color: "text-indigo-600",
            sub: "All-time",
          },
          {
            label: "New Patients",
            value: newPatients,
            color: "text-blue-600",
            trend: { value: newTrend, label: "vs prev period" },
          },
          {
            label: "Returning Patients",
            value: returning,
            color: "text-green-600",
            trend: { value: returningTrend, label: "vs prev period" },
          },
          {
            label: "Retention Rate",
            value: `${retentionRate.toFixed(1)}%`,
            color:
              retentionRate >= 60 ? "text-green-600" : "text-orange-600",
            trend: { value: retentionTrend, label: "vs prev period" },
          },
          {
            label: "Inactive Patients",
            value: inactive,
            color:
              inactive > 20 ? "text-red-600" : "text-muted-foreground",
            sub: "No visit in 90+ days",
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">
            New vs Returning by Month
          </h2>
          {newByMonth.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">
              No data.
            </p>
          ) : (
            <BarChart
              rows={newByMonth.map((m) => ({
                label: m.month as string,
                value: Number(m.new_count ?? 0),
                secondaryValue: Number(m.returning_count ?? 0),
              }))}
              primaryLabel="New"
              secondaryLabel="Returning"
              formatValue={(v) => String(v)}
            />
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3">By Gender</h2>
            {byGender.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">
                No data.
              </p>
            ) : (
              <div className="space-y-2">
                {byGender.map((g) => {
                  const total = byGender.reduce(
                    (s, r) => s + Number(r.count),
                    0
                  );
                  const pct =
                    total > 0 ? (Number(g.count) / total) * 100 : 0;
                  return (
                    <div key={g.gender as string}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize font-medium">
                          {(g.gender as string) || "Unknown"}
                        </span>
                        <span className="text-muted-foreground">
                          {g.count as number} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: "#3b82f6" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3">By Age Group</h2>
            {byAgeGroup.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-sm">
                No data.
              </p>
            ) : (
              <BarChart
                rows={byAgeGroup.map((a) => ({
                  label: a.age_group as string,
                  value: Number(a.count ?? 0),
                }))}
                formatValue={(v) => String(v)}
                height={20}
              />
            )}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
