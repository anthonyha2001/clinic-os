"use client";
import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle } from "lucide-react";

interface SessionSchedulePopupProps {
  planItem: {
    id: string;
    service_id?: string | null;
    description_en?: string | null;
    service?: { name_en?: string } | null;
    quantity_completed: number;
    quantity_total: number;
  };
  plan: {
    id: string;
    patient_id?: string;
    patient?: { first_name?: string; last_name?: string };
    provider?: { id?: string; user?: { full_name?: string } };
    provider_id?: string;
  };
  existingAppointment?: { id: string; startTime: string; endTime?: string } | null;
  onClose: () => void;
  onSuccess: (appointment?: { id: string; start_time: string; plan_item_id?: string | null }) => void;
}

const TIME_SLOTS = [
  "08:00","08:30","09:00","09:30","10:00","10:30",
  "11:00","11:30","12:00","12:30","13:00","13:30",
  "14:00","14:30","15:00","15:30","16:00","16:30",
  "17:00","17:30","18:00","18:30","19:00","19:30",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function SessionSchedulePopup({ planItem, plan, existingAppointment, onClose, onSuccess }: SessionSchedulePopupProps) {
  const today = new Date();
  const existingStart = existingAppointment ? new Date(existingAppointment.startTime) : null;
  const initialDate = existingStart
    ? `${existingStart.getFullYear()}-${String(existingStart.getMonth() + 1).padStart(2, "0")}-${String(existingStart.getDate()).padStart(2, "0")}`
    : "";
  const rawMinutes = existingStart ? existingStart.getHours() * 60 + existingStart.getMinutes() : 0;
  const nearestSlot =
    existingStart && TIME_SLOTS.length > 0
      ? TIME_SLOTS.reduce((best, slot) => {
          const [h, m] = slot.split(":").map(Number);
          const slotMins = h * 60 + m;
          const bestMins = best ? (() => { const [bh, bm] = best.split(":").map(Number); return bh * 60 + bm; })() : -1;
          return Math.abs(slotMins - rawMinutes) < Math.abs(bestMins - rawMinutes) ? slot : best;
        }, TIME_SLOTS[0])
      : "";
  const initialTime = nearestSlot || "";
  const [viewYear, setViewYear] = useState(existingStart?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(existingStart?.getMonth() ?? today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedTime, setSelectedTime] = useState<string>(initialTime);
  const [busySlots, setBusySlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const providerId = (plan as Record<string, unknown>).provider_id as string
    ?? (plan.provider as Record<string, unknown>)?.id as string ?? "";
  const patientId = (plan as Record<string, unknown>).patient_id as string ?? "";
  const sessionLabel = planItem.description_en ?? planItem.service?.name_en ?? "Session";
  const nextSession = Number(planItem.quantity_completed) + 1;

  // Fetch busy slots when date selected
  useEffect(() => {
    if (!selectedDate || !providerId) return;
    setLoadingSlots(true);
    setBusySlots([]);
    const dayStart = `${selectedDate}T00:00:00.000Z`;
    const dayEnd = `${selectedDate}T23:59:59.999Z`;
    fetch(`/api/appointments?start_date=${dayStart}&end_date=${dayEnd}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const appts = Array.isArray(data) ? data : (data.appointments ?? []);
        const busy = appts
          .filter((a: Record<string, unknown>) =>
            (a.providerId ?? a.provider_id) === providerId &&
            !["canceled", "no_show"].includes(a.status as string)
          )
          .map((a: Record<string, unknown>) => {
            const t = new Date((a.startTime ?? a.start_time) as string);
            const localH = String(t.getHours()).padStart(2, "0");
            const localM = String(t.getMinutes()).padStart(2, "0");
            return `${localH}:${localM}`;
          });
        setBusySlots(busy);
        setLoadingSlots(false);
      })
      .catch(() => setLoadingSlots(false));
  }, [selectedDate, providerId]);

  const isReschedule = !!existingAppointment;

  async function handleBook() {
    if (!selectedDate || !selectedTime) { setError("Select a date and time slot"); return; }
    setLoading(true);
    setError(null);

    const startTime = new Date(`${selectedDate}T${selectedTime}:00`);

    if (isReschedule) {
      const durationMs = existingAppointment!.endTime
        ? new Date(existingAppointment.endTime).getTime() - new Date(existingAppointment.startTime).getTime()
        : 30 * 60 * 1000;
      const endTime = new Date(startTime.getTime() + durationMs);

      const res = await fetch(`/api/appointments/${existingAppointment!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
        }),
      });

      if (res.status === 409) {
        setError("This time slot is already taken. Please choose another.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to reschedule appointment.");
        setLoading(false);
        return;
      }

      const updated = (await res.json()) as { id: string; start_time: string; plan_item_id?: string | null };
      setSuccess(true);
      setTimeout(() => {
        onSuccess({ ...updated, plan_item_id: updated.plan_item_id ?? planItem.id });
      }, 800);
      return;
    }

    const serviceId = (planItem as Record<string, unknown>).service_id as string | undefined;
    if (!serviceId) {
      setError("This plan item has no linked service. Please book from the scheduling page.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        patient_id: patientId,
        provider_id: providerId,
        start_time: startTime.toISOString(),
        notes: `${sessionLabel} — Session ${nextSession}/${planItem.quantity_total}`,
        lines: [{ service_id: serviceId, quantity: 1, plan_item_id: planItem.id }],
      }),
    });

    if (res.status === 409) {
      setError("This time slot is already taken. Please choose another.");
      setLoading(false);
      return;
    }
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to book session.");
      setLoading(false);
      return;
    }

    const created = (await res.json()) as { id: string; start_time: string; plan_item_id?: string | null };
    setSuccess(true);
    setTimeout(() => { onSuccess(created); }, 800);
  }

  // Calendar helpers
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth).toLocaleString("en", { month: "long", year: "numeric" });

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDate(""); setSelectedTime("");
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDate(""); setSelectedTime("");
  }

  function selectDay(day: number) {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    setSelectedDate(`${viewYear}-${m}-${d}`);
    setSelectedTime("");
  }

  function isPast(day: number) {
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(0,0,0,0);
    const t = new Date(); t.setHours(0,0,0,0);
    return d < t;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] my-auto pointer-events-auto overflow-hidden flex flex-col shrink-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <div>
              <h2 className="text-base font-bold">{isReschedule ? "Reschedule Session" : "Schedule Session"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {sessionLabel} · Session {nextSession} of {planItem.quantity_total} ·{" "}
                {plan.patient?.first_name} {plan.patient?.last_name}
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </button>
          </div>

          {success ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 shrink-0">
              <CheckCircle className="size-12 text-green-500" />
              <p className="text-base font-semibold">{isReschedule ? "Session rescheduled!" : "Session booked!"}</p>
              <p className="text-sm text-muted-foreground">
                {isReschedule ? "Appointment rescheduled successfully." : "Appointment scheduled successfully."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
              )}

              {/* Mini Calendar */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={prevMonth} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">‹</button>
                  <span className="text-sm font-semibold">{monthName}</span>
                  <button onClick={nextMonth} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">›</button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                    <div key={d} className="text-xs text-muted-foreground py-1 font-medium">{d}</div>
                  ))}
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const past = isPast(day);
                    const m = String(viewMonth + 1).padStart(2, "0");
                    const d = String(day).padStart(2, "0");
                    const dateStr = `${viewYear}-${m}-${d}`;
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button
                        key={day}
                        onClick={() => !past && selectDay(day)}
                        disabled={past}
                        className={`h-8 w-8 mx-auto rounded-full text-xs font-medium transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : past
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "hover:bg-muted"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Available Times{loadingSlots && " (checking...)"}
                  </p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {TIME_SLOTS.map(slot => {
                      const busy = busySlots.includes(slot);
                      const selected = selectedTime === slot;
                      return (
                        <button
                          key={slot}
                          onClick={() => !busy && setSelectedTime(slot)}
                          disabled={busy}
                          className={`rounded-lg py-1.5 text-xs font-medium transition-colors border ${
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : busy
                              ? "bg-red-50 text-red-300 border-red-100 cursor-not-allowed line-through"
                              : "hover:bg-primary/10 hover:border-primary/30 border-transparent bg-muted/50"
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded bg-primary inline-block" /> Available
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded bg-red-200 inline-block" /> Booked
                    </span>
                  </div>
                </div>
              )}

              {/* Summary */}
              {selectedDate && selectedTime && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 px-4 py-3 text-sm">
                  <p className="font-medium">{sessionLabel}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {new Date(`${selectedDate}T${selectedTime}`).toLocaleDateString("en", {
                      weekday: "long", month: "long", day: "numeric"
                    })} at {selectedTime} · Session {nextSession}/{planItem.quantity_total}
                  </p>
                </div>
              )}
              </div>

              {/* Actions - fixed at bottom */}
              <div className="flex gap-3 px-5 py-4 shrink-0 border-t">
                <button onClick={onClose} className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
                  Cancel
                </button>
                <button
                  onClick={handleBook}
                  disabled={!selectedDate || !selectedTime || loading}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><Loader2 className="size-4 animate-spin" /> {isReschedule ? "Rescheduling..." : "Booking..."}</>
                  ) : (
                    isReschedule ? "Confirm Reschedule" : "Confirm Booking"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}