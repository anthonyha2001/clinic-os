"use client";

import { useCurrency } from "@/lib/context/CurrencyContext";
import { useMemo, useState, useEffect } from "react";
import { Download, User, Stethoscope } from "lucide-react";
import { PlanDetailDrawer } from "./PlanDetailDrawer";
import { NewPlanDrawer } from "./NewPlanDrawer";
import { SearchInput } from "@/components/ui/SearchInput";
import { useFetch } from "@/hooks/useFetch";
import { apiCache } from "@/lib/cache/apiCache";

const STATUS_COLORS: Record<string, string> = {
  proposed: "app-badge app-badge-neutral",
  accepted: "app-badge app-badge-medium",
  in_progress: "app-badge app-badge-medium",
  completed: "app-badge app-badge-low",
  canceled: "app-badge app-badge-high",
};

const STATUS_OPTIONS = ["all", "proposed", "accepted", "in_progress", "completed", "canceled"];

type Plan = Record<string, unknown>;
type Provider = { id: string; user?: { full_name?: string }; full_name?: string };

export function PlansClient({ locale }: { locale: string }) {
  const { format } = useCurrency();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const plansUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (providerFilter !== "all") params.set("provider_id", providerFilter);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    return `/api/plans?${params.toString()}`;
  }, [statusFilter, providerFilter, startDate, endDate]);
  const {
    data: plansData,
    loading,
    refetch: refetchPlans,
  } = useFetch<Plan[] | { plans?: Plan[] }>(plansUrl, {
    ttl: 30_000,
    initialData: [],
  });
  const { data: providersData } = useFetch<Provider[] | { providers?: Provider[] }>(
    "/api/providers",
    { ttl: 300_000, initialData: [] }
  );

  useEffect(() => {
    const raw = Array.isArray(plansData) ? plansData : plansData?.plans ?? [];
    setPlans((Array.isArray(raw) ? raw : []) as Plan[]);
  }, [plansData]);

  useEffect(() => {
    const raw = Array.isArray(providersData)
      ? providersData
      : providersData?.providers ?? [];
    setProviders((Array.isArray(raw) ? raw : []) as Provider[]);
  }, [providersData]);

  async function handleQuickAction(
    e: React.MouseEvent,
    planId: string,
    action: string
  ) {
    e.stopPropagation();
    setActionLoading(planId + action);

    if (action === "add_session") {
      window.location.href = `/${locale}/scheduling?plan_id=${planId}`;
      return;
    }

    const statusMap: Record<string, string> = {
      approve: "accepted",
      start: "in_progress",
      complete: "completed",
      cancel: "canceled",
    };

    await fetch(`/api/plans/${planId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusMap[action] }),
    });

    setActionLoading(null);
    apiCache.invalidate("/api/plans");
    refetchPlans();
  }

  function exportToCSV() {
    const headers = [
      "Plan Name",
      "Patient",
      "Provider",
      "Status",
      "Sessions Done",
      "Total Sessions",
      "Estimated Cost",
      "Created",
    ];
    const rows = filtered.map((plan) => {
      const patient = plan.patient as Record<string, string> | undefined;
      const provider = plan.provider as Record<string, unknown> | undefined;
      return [
        plan.name_en,
        `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim(),
        (provider?.user as Record<string, string> | undefined)?.full_name ??
          (provider as Record<string, string> | undefined)?.full_name ??
          "—",
        plan.status,
        plan.completed_sessions ?? 0,
        plan.total_sessions ?? 0,
        plan.total_estimated_cost
          ? format(Number(plan.total_estimated_cost))
          : "—",
        new Date(
          (plan.proposed_at ?? plan.created_at) as string
        ).toLocaleDateString(),
      ];
    });

    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${v}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plans-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getQuickActions(plan: Plan): {
    label: string;
    action: string;
    color: string;
  }[] {
    const status = plan.status as string;
    const actions: { label: string; action: string; color: string }[] = [];

    if (status === "proposed")
      actions.push({
        label: "Approve",
        action: "approve",
        color: "bg-teal-600 text-white hover:bg-teal-700",
      });
    if (status === "accepted")
      actions.push({
        label: "Start",
        action: "start",
        color: "bg-purple-600 text-white hover:bg-purple-700",
      });
    if (status === "in_progress") {
      actions.push({
        label: "+ Session",
        action: "add_session",
        color: "bg-primary text-primary-foreground hover:opacity-90",
      });
      actions.push({
        label: "Complete",
        action: "complete",
        color: "bg-green-600 text-white hover:bg-green-700",
      });
    }
    if (!["completed", "canceled"].includes(status)) {
      actions.push({
        label: "Cancel",
        action: "cancel",
        color: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
      });
    }

    return actions;
  }

  const filtered = plans.filter((plan) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const patient = plan.patient as Record<string, string> | undefined;
    return (
      (plan.name_en as string)?.toLowerCase().includes(q) ||
      patient?.first_name?.toLowerCase().includes(q) ||
      patient?.last_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="list-page-header">
        <div>
          <h1 className="list-page-title">Treatment Plans</h1>
          <p className="list-page-subtitle">
            {filtered.length} plans
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportToCSV}
            className="app-btn-secondary flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Download className="size-4 inline-block" />
            Export CSV
          </button>
          <button
            onClick={() => setShowNewPlan(true)}
            className="app-btn-primary px-4 py-2 text-sm font-medium transition-colors"
          >
            + New Plan
          </button>
        </div>
      </div>

      {/* Status filter cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUS_OPTIONS.map((status) => {
          const count =
            status === "all"
              ? plans.length
              : plans.filter((p) => p.status === status).length;
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
                className={`mt-1 inline-block capitalize ${
                  status === "all"
                    ? "app-badge app-badge-neutral"
                    : STATUS_COLORS[status] ?? ""
                }`}
              >
                {status.replace("_", " ")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by plan name or patient..."
          className="w-64"
        />

        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All Providers</option>
          {(Array.isArray(providers) ? providers : []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.user?.full_name ?? p.full_name}
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

        {(providerFilter !== "all" || startDate || endDate || search) && (
          <button
            onClick={() => {
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

      {/* Plans list */}
      <div className="space-y-3">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground">
            {search || providerFilter !== "all" || startDate
              ? "No plans match your filters."
              : "No treatment plans found. Create your first plan."}
          </div>
        ) : (
          filtered.map((plan) => {
            const patient = plan.patient as Record<string, string> | undefined;
            const provider = plan.provider as Record<string, unknown> | undefined;
            const totalSessions = Number(plan.total_sessions ?? 0);
            const completedSessions = Number(plan.completed_sessions ?? 0);
            const progressPct =
              totalSessions > 0
                ? Math.min((completedSessions / totalSessions) * 100, 100)
                : 0;
            const quickActions = getQuickActions(plan);

            return (
              <div
                key={plan.id as string}
                onClick={() => setSelectedPlanId(plan.id as string)}
                className="rounded-xl border bg-card p-5 cursor-pointer hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold truncate">
                        {plan.name_en as string}
                      </h3>
                      <span
                        className={`shrink-0 ${
                          STATUS_COLORS[plan.status as string] ??
                          "app-badge app-badge-neutral"
                        }`}
                      >
                        {(plan.status as string)?.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="size-4 inline-block" />
                        {patient?.first_name} {patient?.last_name}
                        {patient?.phone && ` · ${patient.phone}`}
                      </span>
                      <span className="flex items-center gap-1">
                        <Stethoscope className="size-4 inline-block" />
                        {(provider?.user as Record<string, string> | undefined)
                          ?.full_name ??
                          (provider as Record<string, string> | undefined)
                            ?.full_name ??
                          "—"}
                      </span>
                    </div>
                  </div>

                  <div className="text-end shrink-0 space-y-1">
                    {plan.total_estimated_cost != null && (
                      <p className="font-semibold">
                        {format(Number(plan.total_estimated_cost))}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {completedSessions}/{totalSessions || "?"} sessions
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(
                        (plan.proposed_at ?? plan.created_at) as string
                      ).toLocaleDateString(locale)}
                    </p>
                  </div>
                </div>

                {totalSessions > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progressPct >= 100 ? "bg-green-500" : "bg-primary"
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {progressPct.toFixed(0)}% complete
                    </p>
                  </div>
                )}

                {quickActions.length > 0 && (
                  <div
                    className="mt-4 pt-3 border-t flex gap-2 flex-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {quickActions.map((qa) => (
                      <button
                        key={qa.action}
                        onClick={(e) =>
                          handleQuickAction(e, plan.id as string, qa.action)
                        }
                        disabled={
                          actionLoading === (plan.id as string) + qa.action
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${qa.color}`}
                      >
                        {actionLoading === (plan.id as string) + qa.action
                          ? "..."
                          : qa.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {selectedPlanId && (
        <PlanDetailDrawer
          planId={selectedPlanId}
          locale={locale}
          onClose={() => setSelectedPlanId(null)}
          onStatusChange={() => {
            apiCache.invalidate("/api/plans");
            refetchPlans();
          }}
        />
      )}

      {showNewPlan && (
        <NewPlanDrawer
          locale={locale}
          onClose={() => setShowNewPlan(false)}
          onSuccess={() => {
            setShowNewPlan(false);
            apiCache.invalidate("/api/plans");
            refetchPlans();
          }}
        />
      )}
    </div>
  );
}
