"use client";

import { useCurrency } from "@/lib/context/CurrencyContext";
import { isClinicOpen, getOffDayForDate } from "@/lib/services/schedule/isClinicOpen";
import type { WorkingHours, OffDay } from "@/types/schedule";

import { useState, useEffect } from "react";
import { X, ClipboardList } from "lucide-react";

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface AppointmentFormDrawerProps {
  initialDate?: Date;
  initialProviderId?: string;
  initialPatientId?: string;
  initialPatientName?: string;
  initialPlanItemId?: string;
  editingAppointment?: {
    id: string;
    start_time?: string;
    end_time?: string;
    provider_id?: string;
    notes?: string | null;
  } | null;
  providers?: Record<string, unknown>[];
  onClose: () => void;
  onSuccess: () => void;
}

interface PatientOption {
  id: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  phone: string;
}

interface ProviderOption {
  id: string;
  name?: string;
  user?: { full_name?: string };
  full_name?: string;
}

interface ServiceOption {
  id: string;
  name_en?: string;
  nameEn?: string;
  default_duration_minutes?: number;
  defaultDurationMinutes?: number;
}

interface PlanItem {
  id: string;
  description_en: string;
  quantity_completed: number;
  quantity_total: number;
  unit_price: number;
  service?: { name_en: string } | null;
}

interface Plan {
  id: string;
  name_en: string;
  status: string;
  items: PlanItem[];
}

export function AppointmentFormDrawer({
  initialDate,
  initialProviderId,
  initialPatientId,
  initialPatientName,
  initialPlanItemId,
  editingAppointment,
  providers: providersProp,
  onClose,
  onSuccess,
}: AppointmentFormDrawerProps) {
  const { format } = useCurrency();
  const [providersFromApi, setProvidersFromApi] = useState<ProviderOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(
    initialPatientId && initialPatientName
      ? {
          id: initialPatientId,
          first_name: initialPatientName.split(" ")[0] ?? "",
          last_name: initialPatientName.split(" ").slice(1).join(" ") ?? "",
          phone: "",
        }
      : null
  );

  // Plan linking state
  const [patientPlans, setPatientPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<string>(initialPlanItemId ?? "");
  const [showPlanSection, setShowPlanSection] = useState(!!initialPlanItemId);
  const [plansLoading, setPlansLoading] = useState(false);

  const defaultDate = editingAppointment?.start_time
    ? new Date(editingAppointment.start_time)
    : initialDate ?? new Date();
  const providersList =
    providersProp && providersProp.length > 0
      ? (providersProp as unknown as ProviderOption[])
      : providersFromApi;

  const [form, setForm] = useState({
    provider_id: editingAppointment?.provider_id ?? initialProviderId ?? "",
    service_id: "",
    start_time: formatDateTimeLocal(defaultDate),
    duration_minutes: editingAppointment?.start_time && editingAppointment?.end_time
      ? Math.max(
          5,
          Math.round(
            (new Date(editingAppointment.end_time).getTime() -
              new Date(editingAppointment.start_time).getTime()) /
              60000
          )
        )
      : 30,
    notes: editingAppointment?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scheduleSettings, setScheduleSettings] = useState<{ working_hours?: WorkingHours; off_days?: OffDay[] } | null>(null);

  useEffect(() => {
    if (providersProp && providersProp.length > 0) return;
    fetch("/api/providers", { credentials: "include" })
      .then(async (r) => {
        const data = r.ok ? await r.json() : null;
        const raw = Array.isArray(data) ? data : data?.providers ?? data;
        setProvidersFromApi(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setProvidersFromApi([]));
  }, [providersProp]);

  useEffect(() => {
    fetch("/api/services", { credentials: "include" })
      .then(async (r) => {
        const data = r.ok ? await r.json() : null;
        const raw = Array.isArray(data) ? data : data?.services ?? data;
        setServices(Array.isArray(raw) ? raw : []);
      })
      .catch(() => setServices([]));
  }, []);

  useEffect(() => {
    if (initialDate) setForm((f) => ({ ...f, start_time: formatDateTimeLocal(initialDate) }));
  }, [initialDate]);

  useEffect(() => {
    if (initialProviderId) setForm((f) => ({ ...f, provider_id: initialProviderId }));
  }, [initialProviderId]);
  useEffect(() => {
    if (!editingAppointment) return;
    setForm((f) => ({
      ...f,
      provider_id: editingAppointment.provider_id ?? f.provider_id,
      start_time: editingAppointment.start_time
        ? formatDateTimeLocal(new Date(editingAppointment.start_time))
        : f.start_time,
      duration_minutes:
        editingAppointment.start_time && editingAppointment.end_time
          ? Math.max(
              5,
              Math.round(
                (new Date(editingAppointment.end_time).getTime() -
                  new Date(editingAppointment.start_time).getTime()) /
                  60000
              )
            )
          : f.duration_minutes,
      notes: editingAppointment.notes ?? "",
    }));
  }, [editingAppointment]);

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setScheduleSettings({ working_hours: d?.working_hours, off_days: d?.off_days }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (patientSearch.length < 2 && !initialPatientId) { setPatients([]); return; }
    if (initialPatientId && initialPatientName) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/patients?search=${encodeURIComponent(patientSearch)}&limit=20`, { credentials: "include" });
      const data = await res.json();
      setPatients(data.patients ?? (Array.isArray(data) ? data : []));
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch, initialPatientId, initialPatientName]);

  // Fetch active plans when patient is selected and plan section is toggled
  useEffect(() => {
    if (!selectedPatient || !showPlanSection) return;
    setPlansLoading(true);
    fetch(`/api/plans?patient_id=${selectedPatient.id}&status=accepted`, { credentials: "include" })
      .then((r) => r.json())
      .then(async (d1) => {
        const accepted = d1.plans ?? [];
        const r2 = await fetch(`/api/plans?patient_id=${selectedPatient.id}&status=in_progress`, { credentials: "include" });
        const d2 = await r2.json();
        const inProgress = d2.plans ?? [];
        const allPlans: Plan[] = [...accepted, ...inProgress];
        // Fetch full plan details to get items
        const detailed = await Promise.all(
          allPlans.map((p) =>
            fetch(`/api/plans/${p.id}`, { credentials: "include" })
              .then((r) => r.json())
              .then((d) => d.plan ?? d)
          )
        );
        setPatientPlans(detailed.filter(Boolean));
        setPlansLoading(false);
      })
      .catch(() => setPlansLoading(false));
  }, [selectedPatient, showPlanSection]);

  function handleServiceChange(serviceId: string) {
    const service = services.find((s) => s.id === serviceId);
    const duration = service?.default_duration_minutes ?? service?.defaultDurationMinutes ?? 30;
    setForm((f) => ({ ...f, service_id: serviceId, duration_minutes: duration }));
  }

  // When a plan item is selected, auto-fill service
  useEffect(() => {
    if (!selectedPlanItemId) return;
    const plan = patientPlans.find((p) => p.items?.some((i) => i.id === selectedPlanItemId));
    const item = plan?.items?.find((i) => i.id === selectedPlanItemId);
    if (item?.service) {
      const matchingService = services.find((s) => s.name_en === item.service?.name_en);
      if (matchingService) {
        handleServiceChange(matchingService.id);
      }
    }
  }, [selectedPlanItemId, patientPlans, services]);

  const selectedPlan = patientPlans.find((p) => p.id === selectedPlanId);
  const availableItems = selectedPlan?.items?.filter(
    (i) => Number(i.quantity_completed) < Number(i.quantity_total)
  ) ?? [];

  async function handleSubmit() {
    if (!selectedPatient) { setError("Please select a patient"); return; }
    if (!form.provider_id) { setError("Please select a provider"); return; }
    if (!editingAppointment && !form.service_id) { setError("Please select a service"); return; }
    if (!form.start_time) { setError("Please select a date and time"); return; }
    if (!editingAppointment && showPlanSection && selectedPlanId && !selectedPlanItemId) {
      setError("Please select a plan item or unlink the plan");
      return;
    }

    setLoading(true);
    setError(null);

    const startTime = new Date(form.start_time);
    const endTime = new Date(startTime.getTime() + form.duration_minutes * 60000);
    const res = editingAppointment
      ? await fetch(`/api/appointments/${editingAppointment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            provider_id: form.provider_id,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            notes: form.notes || null,
          }),
        })
      : await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            patient_id: selectedPatient.id,
            provider_id: form.provider_id,
            start_time: startTime.toISOString(),
            notes: form.notes || undefined,
            lines: [{
              service_id: form.service_id,
              quantity: 1,
              plan_item_id: selectedPlanItemId || undefined,
            }],
          }),
        });

    if (res.status === 409) {
      setError("This time slot conflicts with an existing appointment for this provider.");
      setLoading(false);
      return;
    }
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? (editingAppointment ? "Failed to update appointment." : "Failed to create appointment."));
      setLoading(false);
      return;
    }
    onSuccess();
  }

  const patientName = (p: PatientOption) =>
    `${p.first_name ?? p.firstName ?? ""} ${p.last_name ?? p.lastName ?? ""}`.trim();
  const providerLabel = (p: ProviderOption) =>
    p.user?.full_name ?? p.full_name ?? p.name ?? p.id;
  const serviceLabel = (s: ServiceOption) => s.name_en ?? s.nameEn ?? s.id;

  const startDate = form.start_time ? new Date(form.start_time) : null;
  const openResult = startDate && scheduleSettings
    ? isClinicOpen(scheduleSettings.working_hours, scheduleSettings.off_days, startDate)
    : null;
  const offDay = startDate && scheduleSettings ? getOffDayForDate(scheduleSettings.off_days, startDate) : null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
      <div className="fixed inset-y-0 end-0 z-50 flex w-full max-w-md flex-col bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            {editingAppointment ? "Reschedule Appointment" : "New Appointment"}
          </h2>
          <button type="button" onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 px-4 py-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          )}

          {openResult && !openResult.open && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-900/50 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
              {offDay ? (
                <p>⚠️ This date is marked as an off day: {offDay.label}</p>
              ) : (
                <p>⚠️ This time is outside regular working hours</p>
              )}
            </div>
          )}

          {/* Patient */}
          <div>
            <label className="mb-1 block text-sm font-medium">Patient</label>
            {selectedPatient ? (
              <div className="flex items-center justify-between rounded-lg border bg-muted px-3 py-2">
                <span className="text-sm font-medium">{patientName(selectedPatient)} — {selectedPatient.phone}</span>
                {!initialPatientId && (
                  <button type="button" onClick={() => { setSelectedPatient(null); setPatientPlans([]); setSelectedPlanId(""); setSelectedPlanItemId(""); }} className="text-muted-foreground hover:text-foreground p-0.5">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {patients.length > 0 && (
                  <div className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
                    {patients.map((p) => (
                      <button key={p.id} type="button" onClick={() => { setSelectedPatient(p); setPatients([]); setPatientSearch(""); }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {patientName(p)} — {p.phone}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Provider */}
          <div>
            <label className="mb-1 block text-sm font-medium">Provider</label>
            <select value={form.provider_id} onChange={(e) => setForm((f) => ({ ...f, provider_id: e.target.value }))}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="">Select provider...</option>
              {(Array.isArray(providersList) ? providersList : []).map((p) => <option key={p.id} value={p.id}>{providerLabel(p)}</option>)}
            </select>
          </div>

          {/* Link to Treatment Plan — only show if patient selected */}
          {selectedPatient && !editingAppointment && (
            <div className="rounded-xl border overflow-hidden">
              <button
                type="button"
                onClick={() => { setShowPlanSection((s) => !s); setSelectedPlanId(""); setSelectedPlanItemId(""); }}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-2">
                  <ClipboardList className="size-4 text-primary" />
                  Link to Treatment Plan (optional)
                </span>
                <span className="text-xs text-muted-foreground">{showPlanSection ? "▲ Hide" : "▼ Show"}</span>
              </button>

              {showPlanSection && (
                <div className="border-t px-4 py-4 space-y-3 bg-muted/30">
                  {plansLoading ? (
                    <p className="text-xs text-muted-foreground animate-pulse">Loading plans...</p>
                  ) : patientPlans.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No active treatment plans for this patient.</p>
                  ) : (
                    <>
                      {/* Plan selector */}
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Treatment Plan</label>
                        <select
                          value={selectedPlanId}
                          onChange={(e) => { setSelectedPlanId(e.target.value); setSelectedPlanItemId(""); }}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="">Select plan...</option>
                          {patientPlans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name_en} ({p.status.replace("_", " ")})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Plan item selector */}
                      {selectedPlanId && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Plan Item / Session</label>
                          {availableItems.length === 0 ? (
                            <p className="text-xs text-orange-600">All items in this plan are completed.</p>
                          ) : (
                            <select
                              value={selectedPlanItemId}
                              onChange={(e) => setSelectedPlanItemId(e.target.value)}
                              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                              <option value="">Select item...</option>
                              {availableItems.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.service?.name_en ?? item.description_en} — {item.quantity_completed}/{item.quantity_total} sessions · {format(Number(item.unit_price))}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      {/* Selected item badge */}
                      {selectedPlanItemId && (
                        <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
                          <ClipboardList className="size-3.5 text-primary shrink-0" />
                          <span className="text-xs text-primary font-medium">
                            Linked to plan — session will be tracked automatically
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Service */}
          {!editingAppointment && (
            <div>
              <label className="mb-1 block text-sm font-medium">Service</label>
              <select value={form.service_id} onChange={(e) => handleServiceChange(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">Select service...</option>
                {(Array.isArray(services) ? services : []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {serviceLabel(s)} ({(s.default_duration_minutes ?? s.defaultDurationMinutes) ?? 30}min)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date & Time */}
          <div>
            <label className="mb-1 block text-sm font-medium">Date & Time</label>
            <input type="datetime-local" value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="mb-1 block text-sm font-medium">Duration (minutes)</label>
            <input type="number" min={5} max={480} step={5} value={form.duration_minutes}
              onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3} placeholder="Any additional notes..."
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex gap-3 border-t px-6 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {loading
              ? editingAppointment
                ? "Saving..."
                : "Booking..."
              : editingAppointment
                ? "Save Changes"
                : "Book Appointment"}
          </button>
        </div>
      </div>
    </>
  );
}
