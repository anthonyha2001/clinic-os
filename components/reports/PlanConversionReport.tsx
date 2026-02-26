"use client";
import { useState, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { ReportDatePicker } from "./ReportDatePicker";
import { useReportDateRange } from "./useReportDateRange";

interface ConversionRow {
  period: string;
  proposed: number;
  accepted: number;
  completed: number;
  canceled: number;
  acceptance_rate: number;
  completion_rate: number;
}

interface ConversionData {
  rows: ConversionRow[];
  summary: {
    total_proposed: number;
    total_accepted: number;
    total_completed: number;
    total_canceled: number;
    overall_acceptance_rate: number;
    overall_completion_rate: number;
  };
}

export function PlanConversionReport({ locale }: { locale: string }) {
  const { startDate, endDate, setStartDate, setEndDate } =
    useReportDateRange(12);
  const [data, setData] = useState<ConversionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"month" | "provider">("month");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/reports/plan-conversion?group_by=${groupBy}&start_date=${startDate}&end_date=${endDate}`,
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
  }, [groupBy, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function exportCSV() {
    const rows = data?.rows ?? [];
    const csv = [
      ["Period", "Proposed", "Accepted", "Completed", "Canceled", "Accept %", "Complete %"],
      ...rows.map((row) => [
        row.period,
        row.proposed,
        row.accepted,
        row.completed,
        row.canceled,
        `${Number(row.acceptance_rate).toFixed(1)}%`,
        `${Number(row.completion_rate).toFixed(1)}%`,
      ]),
    ]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `plan-conversion-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl" />
          ))}
        </div>
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!data || (data as { error?: string }).error) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="font-medium text-destructive">Failed to load plan conversion report</p>
        <p className="text-sm text-muted-foreground mt-1">
          You may need permission to view reports, or the server could not load data.
        </p>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const funnelStages = [
    { label: "Proposed", value: summary?.total_proposed ?? 0, color: "bg-blue-500", pct: 100 },
    {
      label: "Accepted",
      value: summary?.total_accepted ?? 0,
      color: "bg-teal-500",
      pct:
        (summary?.total_proposed ?? 0) > 0
          ? ((summary?.total_accepted ?? 0) / (summary?.total_proposed ?? 1)) * 100
          : 0,
    },
    {
      label: "Completed",
      value: summary?.total_completed ?? 0,
      color: "bg-green-500",
      pct:
        (summary?.total_proposed ?? 0) > 0
          ? ((summary?.total_completed ?? 0) / (summary?.total_proposed ?? 1)) * 100
          : 0,
    },
    {
      label: "Canceled",
      value: summary?.total_canceled ?? 0,
      color: "bg-red-400",
      pct:
        (summary?.total_proposed ?? 0) > 0
          ? ((summary?.total_canceled ?? 0) / (summary?.total_proposed ?? 1)) * 100
          : 0,
    },
  ];

  function getRateColor(rate: number) {
    if (rate >= 70) return "text-green-600";
    if (rate >= 40) return "text-orange-600";
    return "text-red-600";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <ReportDatePicker
          startDate={startDate}
          endDate={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
        />
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            {(["month", "provider"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  groupBy === g
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            onClick={exportCSV}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted flex items-center gap-1.5"
          >
            <Download className="size-3.5 inline-block" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Total Proposed</p>
          <p className="text-2xl font-bold mt-1">
            {summary?.total_proposed ?? 0}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Accepted</p>
          <p className="text-2xl font-bold mt-1 text-teal-600">
            {summary?.total_accepted ?? 0}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Acceptance Rate</p>
          <p
            className={`text-2xl font-bold mt-1 ${getRateColor(Number(summary?.overall_acceptance_rate ?? 0))}`}
          >
            {Number(summary?.overall_acceptance_rate ?? 0).toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">Completion Rate</p>
          <p
            className={`text-2xl font-bold mt-1 ${getRateColor(Number(summary?.overall_completion_rate ?? 0))}`}
          >
            {Number(summary?.overall_completion_rate ?? 0).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Funnel */}
      <div className="rounded-xl border bg-card p-6">
        <h2 className="font-semibold mb-6">Conversion Funnel</h2>
        {!summary || summary.total_proposed === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No plan data available.
          </p>
        ) : (
          <div className="space-y-4 max-w-xl">
            {funnelStages.map((stage) => (
              <div key={stage.label} className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-20 shrink-0">
                  {stage.label}
                </span>
                <div className="flex-1 h-8 bg-muted rounded overflow-hidden">
                  <div
                    className={`h-full ${stage.color} rounded flex items-center justify-end pe-3 transition-all duration-700`}
                    style={{
                      width: `${stage.pct}%`,
                      minWidth: stage.value > 0 ? "3rem" : "0",
                    }}
                  >
                    {stage.value > 0 && (
                      <span className="text-xs text-white font-medium">
                        {stage.value}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-medium w-12 shrink-0 text-end">
                  {stage.pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Breakdown table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="font-semibold">
            Breakdown by {groupBy === "month" ? "Month" : "Provider"}
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-muted-foreground">
            No data available.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-start font-medium text-muted-foreground capitalize">
                  {groupBy}
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Proposed
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Accepted
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Completed
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Canceled
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Accept %
                </th>
                <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                  Complete %
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{row.period}</td>
                  <td className="px-4 py-3 text-end">{row.proposed}</td>
                  <td className="px-4 py-3 text-end text-teal-600 font-medium">
                    {row.accepted}
                  </td>
                  <td className="px-4 py-3 text-end text-green-600 font-medium">
                    {row.completed}
                  </td>
                  <td className="px-4 py-3 text-end text-red-500">
                    {row.canceled}
                  </td>
                  <td
                    className={`px-4 py-3 text-end font-medium ${getRateColor(Number(row.acceptance_rate))}`}
                  >
                    {Number(row.acceptance_rate).toFixed(1)}%
                  </td>
                  <td
                    className={`px-4 py-3 text-end font-medium ${getRateColor(Number(row.completion_rate))}`}
                  >
                    {Number(row.completion_rate).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-semibold border-t">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-end">
                  {summary?.total_proposed ?? 0}
                </td>
                <td className="px-4 py-3 text-end text-teal-600">
                  {summary?.total_accepted ?? 0}
                </td>
                <td className="px-4 py-3 text-end text-green-600">
                  {summary?.total_completed ?? 0}
                </td>
                <td className="px-4 py-3 text-end text-red-500">
                  {summary?.total_canceled ?? 0}
                </td>
                <td
                  className={`px-4 py-3 text-end ${getRateColor(Number(summary?.overall_acceptance_rate ?? 0))}`}
                >
                  {Number(summary?.overall_acceptance_rate ?? 0).toFixed(1)}%
                </td>
                <td
                  className={`px-4 py-3 text-end ${getRateColor(Number(summary?.overall_completion_rate ?? 0))}`}
                >
                  {Number(summary?.overall_completion_rate ?? 0).toFixed(1)}%
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
