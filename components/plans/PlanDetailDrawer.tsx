"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, X, Check, Calendar, CheckCircle, Loader2 } from "lucide-react";
import { SessionSchedulePopup } from "@/components/scheduling/SessionSchedulePopup";

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-green-100 text-green-700",
  canceled: "bg-red-100 text-red-700",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  proposed: ["accepted", "canceled"],
  accepted: ["in_progress", "canceled"],
  in_progress: ["completed", "canceled"],
  completed: [],
  canceled: [],
};

const TRANSITION_STYLES: Record<string, string> = {
  accepted: "bg-teal-600 text-white hover:bg-teal-700",
  in_progress: "bg-purple-600 text-white hover:bg-purple-700",
  completed: "bg-green-600 text-white hover:bg-green-700",
  canceled: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
};

type PlanItem = {
  id: string;
  service_id?: string | null;
  description_en?: string;
  service?: { name_en?: string };
  quantity_total: number;
  quantity_completed: number;
  unit_price: number;
};

type HistoryEntry = {
  id: string;
  old_status?: string;
  new_status: string;
  created_at: string;
};

type Plan = {
  id: string;
  name_en: string;
  status: string;
  total_estimated_cost?: number;
  notes?: string;
  proposed_at?: string;
  accepted_at?: string;
  completed_at?: string;
  created_at: string;
  patient_id?: string;
  provider_id?: string;
  patient?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
  provider?: {
    full_name?: string;
    user?: { full_name?: string };
  };
  items?: PlanItem[];
  history?: HistoryEntry[];
};

export function PlanDetailDrawer({
  planId,
  locale,
  onClose,
  onStatusChange,
}: {
  planId: string;
  locale: string;
  onClose: () => void;
  onStatusChange: () => void;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<PlanItem | null>(null);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<{
    id: string;
    startTime: string;
    endTime?: string;
  } | null>(null);
  const [planAppointments, setPlanAppointments] = useState<
    Record<string, { id: string; startTime: string; endTime?: string; status: string }[]>
  >({});
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/plans/${planId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setPlan(d.plan ?? d);
        setLoading(false);
      });
  }, [planId]);

  async function refreshAppointments(bustCache = false) {
    const today = new Date();
    const ago = new Date(today.getFullYear(), today.getMonth() - 3, 1);
    const ahead = new Date(today.getFullYear(), today.getMonth() + 3, 31);
    const url = `/api/appointments?start_date=${ago.toISOString()}&end_date=${ahead.toISOString()}${bustCache ? `&_t=${Date.now()}` : ""}`;
    const ar = await fetch(url, { credentials: "include", cache: bustCache ? "no-store" : "default" });
    const ad = await ar.json();
    const appts = Array.isArray(ad) ? ad : (ad.appointments ?? []);
    const byPlanItem: Record<
      string,
      { id: string; startTime: string; endTime?: string; status: string }[]
    > = {};
    for (const a of appts) {
      const pid = a.planItemId ?? a.plan_item_id;
      if (pid) {
        if (!byPlanItem[pid]) byPlanItem[pid] = [];
        byPlanItem[pid].push({
          id: a.id,
          startTime: a.startTime ?? a.start_time,
          endTime: a.endTime ?? a.end_time,
          status: a.status,
        });
      }
    }
    setPlanAppointments(byPlanItem);
  }

  useEffect(() => {
    if (!plan) return;
    refreshAppointments();
  }, [plan?.id]);

  async function handleTransition(newStatus: string) {
    setActionLoading(true);
    await fetch(`/api/plans/${planId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const res = await fetch(`/api/plans/${planId}`, { credentials: "include" });
    const data = await res.json();
    setPlan(data.plan ?? data);
    setActionLoading(false);
    onStatusChange();
  }

  async function completeSession(appointmentId: string, currentStatus: string) {
    setSessionLoading(appointmentId);
    setSessionError(null);

    // If still scheduled, confirm first then complete
    if (currentStatus === "scheduled") {
      const confirmRes = await fetch(`/api/appointments/${appointmentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "confirmed" }),
      });
      if (!confirmRes.ok) {
        // If confirm fails, try completing directly anyway
      }
    }

    const res = await fetch(`/api/appointments/${appointmentId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "completed" }),
    });

    if (!res.ok) {
      const d = await res.json();
      setSessionError(d.error ?? "Failed to complete session");
      setSessionLoading(null);
      return;
    }

    window.dispatchEvent(new Event("billing:invoice-from-appointment"));
    setSessionLoading(null);
    const r = await fetch(`/api/plans/${planId}`, { credentials: "include" });
    const d = await r.json();
    setPlan(d.plan ?? d);
    refreshAppointments();
    onStatusChange();
  }

  const items = plan?.items ?? [];
  const totalSessions = items.reduce((s, i) => s + Number(i.quantity_total ?? 0), 0);
  const completedSessions = items.reduce((s, i) => s + Number(i.quantity_completed ?? 0), 0);
  const progressPct = totalSessions > 0 ? Math.min((completedSessions / totalSessions) * 100, 100) : 0;
  const transitions = plan ? (VALID_TRANSITIONS[plan.status] ?? []) : [];
  const providerName = plan?.provider?.user?.full_name ?? plan?.provider?.full_name ?? "—";
  const totalValue = items.reduce((s, i) => s + Number(i.unit_price ?? 0) * Number(i.quantity_total ?? 0), 0);

  return (
    <div>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 end-0 z-50 w-full max-w-lg bg-card shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold truncate">
            {loading ? "Loading..." : plan?.name_en}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {plan && (
              <button
                onClick={() => router.push(`/${locale}/plans/${planId}`)}
                className="text-xs text-primary hover:underline"
              >
                Full page
                <ArrowRight className="size-4 inline-block ms-0.5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-xl ms-2"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 p-6 space-y-4 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded-lg" />
            ))}
          </div>
        ) : !plan ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Plan not found.
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Status + progress */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[plan.status] ?? ""}`}>
                    {plan.status.replace("_", " ")}
                  </span>
                  {plan.total_estimated_cost != null && (
                    <span className="text-sm font-semibold">
                      ${Number(plan.total_estimated_cost).toFixed(2)}
                    </span>
                  )}
                </div>

                {totalSessions > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span>
                      <span>
                        {completedSessions} / {totalSessions} sessions · {progressPct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progressPct >= 100 ? "bg-green-500" : "bg-primary"}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Patient & Provider */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Patient</p>
                  <p className="font-medium">
                    {plan.patient?.first_name} {plan.patient?.last_name}
                  </p>
                  <p className="text-muted-foreground">{plan.patient?.phone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Provider</p>
                  <p className="font-medium">{providerName}</p>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Proposed</p>
                  <p className="font-medium">
                    {new Date(plan.proposed_at ?? plan.created_at).toLocaleDateString(locale)}
                  </p>
                </div>
                {plan.accepted_at && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Accepted</p>
                    <p className="font-medium">
                      {new Date(plan.accepted_at).toLocaleDateString(locale)}
                    </p>
                  </div>
                )}
              </div>

              {/* Notes */}
              {plan.notes && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm bg-muted rounded-lg p-3">{plan.notes}</p>
                </div>
              )}

              {/* Treatment items */}
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                  Treatment Items
                </p>
                {sessionError && (
                  <div className="mb-3 rounded-lg px-3 py-2 bg-red-50 border border-red-200 text-xs text-red-700">
                    {sessionError}
                  </div>
                )}
                <div className="space-y-3">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items.</p>
                  ) : (
                    items.map((item, index) => {
                      const done = Number(item.quantity_completed ?? 0);
                      const total = Number(item.quantity_total ?? 0);
                      const isComplete = done >= total;
                      const itemPct = total > 0 ? Math.min((done / total) * 100, 100) : 0;
                      const canSchedule =
                        !isComplete &&
                        plan &&
                        ["accepted", "in_progress"].includes(plan.status);
                      const linkedAppts = planAppointments[item.id] ?? [];
                      const scheduledAppt = linkedAppts.find(
                        (a) => a.status === "scheduled" || a.status === "confirmed"
                      );
                      const completedAppts = linkedAppts.filter(
                        (a) => a.status === "completed"
                      );

                      return (
                        <div key={item.id} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  isComplete
                                    ? "bg-green-100 text-green-700"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {isComplete ? <Check className="size-4" /> : index + 1}
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm font-medium">
                                  {item.description_en ?? item.service?.name_en}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {done}/{total} sessions · $
                                  {Number(item.unit_price ?? 0).toFixed(2)}/session
                                </p>

                                {scheduledAppt && plan.status !== "canceled" && (
                                  <div className="flex items-center gap-2 flex-wrap mt-1">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700 font-medium">
                                      <Calendar className="size-3" />
                                      {new Date(scheduledAppt.startTime).toLocaleDateString(locale, {
                                        weekday: "short",
                                        month: "short",
                                        day: "numeric",
                                      })}
                                      {" · "}
                                      {new Date(scheduledAppt.startTime).toLocaleTimeString(locale, {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                      {" · "}
                                      <span className="capitalize">
                                        {scheduledAppt.status}
                                      </span>
                                    </span>
                                    <button
                                      onClick={() => completeSession(scheduledAppt.id, scheduledAppt.status)}
                                      disabled={sessionLoading === scheduledAppt.id}
                                      className="inline-flex items-center gap-1 rounded-full bg-green-600 text-white px-2.5 py-0.5 text-xs font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
                                    >
                                      {sessionLoading === scheduledAppt.id ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : (
                                        <Check className="size-3" />
                                      )}
                                      Mark Complete
                                    </button>
                                  </div>
                                )}

                                {completedAppts.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {completedAppts.map((a) => (
                                      <span
                                        key={a.id}
                                        className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs text-green-700"
                                      >
                                        <CheckCircle className="size-3" />
                                        {new Date(a.startTime).toLocaleDateString(locale, {
                                          month: "short",
                                          day: "numeric",
                                        })}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-end shrink-0 space-y-1">
                              <p className="text-sm font-semibold">
                                ${(Number(item.unit_price ?? 0) * total).toFixed(2)}
                              </p>
                              {canSchedule && (
                                <button
                                  onClick={() => {
                                    setSchedulingItem(item);
                                    setRescheduleAppointment(
                                      scheduledAppt
                                        ? {
                                            id: scheduledAppt.id,
                                            startTime: scheduledAppt.startTime,
                                            endTime: scheduledAppt.endTime,
                                          }
                                        : null
                                    );
                                  }}
                                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                >
                                  <Calendar className="size-3" />
                                  {scheduledAppt ? "Reschedule" : "+ Schedule"}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isComplete ? "bg-green-500" : "bg-primary"}`}
                              style={{ width: `${itemPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Total */}
              {items.length > 0 && (
                <div className="flex justify-between text-sm font-semibold border-t pt-3">
                  <span>Total Plan Value</span>
                  <span>${totalValue.toFixed(2)}</span>
                </div>
              )}

              {/* Status history */}
              {(plan.history ?? []).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">History</p>
                  <div className="space-y-2">
                    {plan.history!.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-2 text-xs">
                        {entry.old_status && (
                          <>
                            <span className={`rounded-full px-2 py-0.5 ${STATUS_COLORS[entry.old_status] ?? ""}`}>
                              {entry.old_status.replace("_", " ")}
                            </span>
                            <ArrowRight className="size-4 inline-block text-muted-foreground" />
                          </>
                        )}
                        <span className={`rounded-full px-2 py-0.5 ${STATUS_COLORS[entry.new_status] ?? ""}`}>
                          {entry.new_status.replace("_", " ")}
                        </span>
                        <span className="text-muted-foreground ms-auto">
                          {new Date(entry.created_at).toLocaleDateString(locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            {transitions.length > 0 && (
              <div className="border-t px-6 py-4 flex gap-3 flex-wrap">
                {transitions.map((status) => (
                  <button
                    key={status}
                    onClick={() => handleTransition(status)}
                    disabled={actionLoading}
                    className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors disabled:opacity-60 ${TRANSITION_STYLES[status] ?? ""}`}
                  >
                    {actionLoading ? "..." : `Mark as ${status.replace("_", " ")}`}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {schedulingItem && plan && (
        <SessionSchedulePopup
          planItem={schedulingItem}
          plan={{
            id: plan.id,
            patient_id: (plan as unknown as Record<string, unknown>).patient_id as string,
            patient: plan.patient,
            provider_id: (plan as unknown as Record<string, unknown>).provider_id as string,
            provider: plan.provider,
          }}
          existingAppointment={rescheduleAppointment}
          onClose={() => {
            setSchedulingItem(null);
            setRescheduleAppointment(null);
          }}
          onSuccess={(createdAppointment) => {
            setSchedulingItem(null);
            if (createdAppointment?.plan_item_id) {
              setPlanAppointments((prev) => {
                const pid = createdAppointment.plan_item_id!;
                const list = prev[pid] ?? [];
                const existingIdx = list.findIndex((a) => a.id === createdAppointment.id);
                const entry = { id: createdAppointment.id, startTime: createdAppointment.start_time, status: "scheduled" };
                if (existingIdx >= 0) {
                  const next = [...list];
                  next[existingIdx] = { ...next[existingIdx], ...entry };
                  return { ...prev, [pid]: next };
                }
                return { ...prev, [pid]: [entry, ...list] };
              });
            }
            fetch(`/api/plans/${planId}`, { credentials: "include", cache: "no-store" })
              .then((r) => r.json())
              .then((d) => {
                setPlan(d.plan ?? d);
                onStatusChange();
              });
            refreshAppointments(true);
          }}
        />
      )}
    </div>
  );
}