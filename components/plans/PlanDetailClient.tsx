"use client";
import { useState, useEffect } from "react";
import { useCurrency } from "@/lib/context/CurrencyContext";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ArrowRight, Calendar, FileText, Loader2, CheckCircle } from "lucide-react";
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
  canceled: "bg-red-600 text-white hover:bg-red-700",
};

interface PlanItem {
  id: string;
  service_id?: string | null;
  description_en?: string | null;
  quantity_completed: number;
  quantity_total: number;
  unit_price: number | string;
  service?: { name_en?: string } | null;
}

interface HistoryEntry {
  id: string;
  old_status?: string | null;
  new_status: string;
  created_at: string;
}

interface Plan {
  id: string;
  name_en: string;
  status: string;
  proposed_at?: string;
  created_at?: string;
  accepted_at?: string | null;
  completed_at?: string | null;
  total_estimated_cost?: number | string | null;
  notes?: string | null;
  patient_id?: string;
  provider_id?: string;
  patient?: { first_name?: string; last_name?: string; phone?: string };
  provider?: { user?: { full_name?: string }; full_name?: string };
  items?: PlanItem[];
  history?: HistoryEntry[];
}

export function PlanDetailClient({ planId, locale }: { planId: string; locale: string }) {
  const router = useRouter();
  const { format, symbol } = useCurrency();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<PlanItem | null>(null);
  const [planAppointments, setPlanAppointments] = useState<
    Record<string, { id: string; startTime: string; endTime?: string; status: string }[]>
  >({});
  const [rescheduleAppointment, setRescheduleAppointment] = useState<{
    id: string;
    startTime: string;
    endTime?: string;
  } | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<{ id: string; number: string } | null>(null);

  useEffect(() => {
    fetch(`/api/plans/${planId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setPlan((d.plan ?? d) as Plan);
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

  async function handleAutoInvoice() {
    if (!plan) return;
    setInvoiceLoading(true);
    setInvoiceError(null);
    const res = await fetch("/api/plans/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ plan_id: plan.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setInvoiceError(data.error ?? "Failed to create invoice.");
      setInvoiceLoading(false);
      return;
    }
    setInvoiceSuccess({
      id: data.id ?? data.invoice?.id,
      number: data.invoice_number ?? data.invoice?.invoice_number ?? "—",
    });
    setInvoiceLoading(false);
  }

  async function handleTransition(newStatus: string) {
    setActionLoading(true);
    await fetch(`/api/plans/${planId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const res = await fetch(`/api/plans/${planId}`, { credentials: "include" });
    const data = await res.json();
    setPlan((data.plan ?? data) as Plan);
    setActionLoading(false);
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
    setPlan((d.plan ?? d) as Plan);
    refreshAppointments();
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse max-w-3xl">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-48 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!plan) {
    return <div className="text-center py-20 text-muted-foreground">Plan not found.</div>;
  }

  const transitions = VALID_TRANSITIONS[plan.status] ?? [];
  const items = plan.items ?? [];
  const totalSessions = items.reduce((sum, item) => sum + item.quantity_total, 0);
  const completedSessions = items.reduce((sum, item) => sum + item.quantity_completed, 0);
  const progressPercent =
    totalSessions > 0 ? Math.min((completedSessions / totalSessions) * 100, 100) : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ArrowLeft className="size-4 inline-block" />
        Back
      </button>

      {/* Header */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">{plan.name_en}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {plan.patient?.first_name} {plan.patient?.last_name}
              {plan.patient?.phone && ` · ${plan.patient.phone}`}
            </p>
            <p className="text-sm text-muted-foreground">
              Provider: {plan.provider?.user?.full_name ?? "—"}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              STATUS_COLORS[plan.status] ?? ""
            }`}
          >
            {plan.status.replace("_", " ")}
          </span>
        </div>

        {/* Progress */}
        {totalSessions > 0 && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">
                {completedSessions} / {totalSessions} sessions
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {progressPercent.toFixed(0)}% complete
            </p>
          </div>
        )}

        {/* Meta */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm pt-2 border-t">
          <div>
            <p className="text-muted-foreground">Proposed</p>
            <p className="font-medium">
              {new Date(plan.proposed_at ?? plan.created_at ?? "").toLocaleDateString(locale)}
            </p>
          </div>
          {plan.accepted_at && (
            <div>
              <p className="text-muted-foreground">Accepted</p>
              <p className="font-medium">
                {new Date(plan.accepted_at).toLocaleDateString(locale)}
              </p>
            </div>
          )}
          {plan.completed_at && (
            <div>
              <p className="text-muted-foreground">Completed</p>
              <p className="font-medium">
                {new Date(plan.completed_at).toLocaleDateString(locale)}
              </p>
            </div>
          )}
          {plan.total_estimated_cost != null && plan.total_estimated_cost !== "" && (
            <div>
              <p className="text-muted-foreground">Est. Cost</p>
              <p className="font-semibold">
                {format(plan.total_estimated_cost)}
              </p>
            </div>
          )}
        </div>

        {plan.notes && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="text-muted-foreground text-xs mb-1">Notes</p>
            <p>{plan.notes}</p>
          </div>
        )}
      </div>

      {/* Plan items */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Treatment Items</h2>
          <span className="text-sm text-muted-foreground">{items.length} items</span>
        </div>
        {sessionError && (
          <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {sessionError}
          </div>
        )}
        <div className="divide-y">
          {items.length === 0 ? (
            <p className="px-6 py-8 text-center text-muted-foreground">No items in this plan.</p>
          ) : (
            items.map((item, index) => {
              const done = Number(item.quantity_completed ?? 0);
              const total = Number(item.quantity_total ?? 0);
              const isComplete = done >= total;
              const itemPct = total > 0 ? Math.min((done / total) * 100, 100) : 0;
              const canSchedule =
                !isComplete && ["accepted", "in_progress"].includes(plan.status);
              const linkedAppts = planAppointments[item.id] ?? [];
              const scheduledAppt = linkedAppts.find(
                (a) => a.status === "scheduled" || a.status === "confirmed"
              );
              const completedAppts = linkedAppts.filter(
                (a) => a.status === "completed"
              );

              return (
                <div key={item.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                          isComplete
                            ? "bg-green-100 text-green-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isComplete ? <Check className="size-4" /> : index + 1}
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium">
                          {item.description_en || item.service?.name_en}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {done} / {total} sessions · {format(item.unit_price)}/session
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
                      <p className="font-semibold">
                        {format(item.unit_price)}
                      </p>
                      <p className="text-xs text-muted-foreground">per session</p>
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

                  <div className="mt-3 ms-10">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isComplete ? "bg-green-500" : "bg-primary"
                        }`}
                        style={{ width: `${itemPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {items.length > 0 && (
          <div className="px-6 py-4 border-t bg-muted/50 flex justify-between text-sm">
            <span className="font-medium">Total Plan Value</span>
            <span className="font-bold">
              {format(
                items.reduce(
                  (sum, item) =>
                    sum + Number(item.unit_price) * item.quantity_total,
                  0
                )
              )}
            </span>
          </div>
        )}
      </div>

      {/* Status history */}
      {(plan.history ?? []).length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Status History</h2>
          </div>
          <div className="divide-y">
            {(plan.history ?? []).map((entry) => (
              <div
                key={entry.id}
                className="px-6 py-3 flex items-center gap-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  {entry.old_status && (
                    <>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          STATUS_COLORS[entry.old_status] ?? ""
                        }`}
                      >
                        {entry.old_status.replace("_", " ")}
                      </span>
                      <ArrowRight className="size-4 inline-block text-muted-foreground" />
                    </>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      STATUS_COLORS[entry.new_status] ?? ""
                    }`}
                  >
                    {entry.new_status.replace("_", " ")}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs ms-auto">
                  {new Date(entry.created_at).toLocaleDateString(locale)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice section — show when plan is completed */}
      {plan.status === "completed" && (
        <div className="rounded-xl border overflow-hidden">
          <div className="px-6 py-3 border-b bg-muted/50">
            <h2 className="text-sm font-semibold">Invoice</h2>
          </div>
          <div className="px-6 py-4 space-y-3">
            {invoiceSuccess ? (
              <div className="space-y-2">
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 font-medium flex items-center gap-2">
                  <CheckCircle className="size-3.5 shrink-0" />
                  Invoice {invoiceSuccess.number} created successfully
                </div>
                <button
                  onClick={() =>
                    router.push(`/${locale}/billing/${invoiceSuccess.id}`)
                  }
                  className="w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  <FileText className="size-4" />
                  Open Invoice
                </button>
              </div>
            ) : (
              <>
                {invoiceError && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {invoiceError}
                  </div>
                )}
                <button
                  onClick={handleAutoInvoice}
                  disabled={invoiceLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {invoiceLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Creating
                      invoice...
                    </>
                  ) : (
                    <>
                      <FileText className="size-4" /> Issue Full Plan Invoice
                    </>
                  )}
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  Creates one invoice covering all completed sessions
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {transitions.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {transitions.map((status) => (
            <button
              key={status}
              onClick={() => handleTransition(status)}
              disabled={actionLoading}
              className={`rounded-lg px-5 py-2 text-sm font-medium capitalize transition-colors disabled:opacity-60 ${
                TRANSITION_STYLES[status] ?? ""
              }`}
            >
              Mark as {status.replace("_", " ")}
            </button>
          ))}
        </div>
      )}

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
              .then((d) => setPlan((d.plan ?? d) as Plan));
            refreshAppointments(true);
          }}
        />
      )}
    </div>
  );
}
