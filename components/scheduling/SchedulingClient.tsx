"use client";
import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MiniCalendar } from "./MiniCalendar";
import { StatsBar } from "./StatsBar";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { AppointmentPanel } from "./AppointmentPanel";
import { AppointmentFormDrawer } from "./AppointmentFormDrawer";
import { apiCache } from "@/lib/cache/apiCache";
import { useFetch, useParallelFetch } from "@/hooks/useFetch";

type Appointment = Record<string, unknown>;
type Provider = Record<string, unknown>;
type CheckinLite = {
  id: string;
  appointment_id: string;
  status: string;
  checked_in_at: string | null;
};

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Normalize API appointment (camelCase / flat) to shape expected by views/panel */
function normalizeAppointment(raw: Record<string, unknown>): Appointment {
  const start = (raw.start_time ?? raw.startTime) as string | undefined;
  const end = (raw.end_time ?? raw.endTime) as string | undefined;
  const patientName = (raw.patientName ?? (raw.patient as Record<string, string>)?.full_name ?? "") as string;
  const parts = String(patientName).trim().split(/\s+/);
  const first_name = parts[0] ?? "";
  const last_name = parts.slice(1).join(" ") ?? "";
  const providerId = (raw.provider_id ?? raw.providerId) as string | undefined;
  const providerName = (raw.providerName ?? (raw.provider as Record<string, string>)?.full_name ?? "") as string;
  const colorHex = (raw.providerColor ?? (raw.provider as Record<string, unknown>)?.color_hex ?? "#6B7280") as string;
  const serviceName = (raw.serviceName ?? (raw.service as Record<string, string>)?.name_en ?? "") as string;
  return {
    ...raw,
    id: raw.id,
    patient_id: raw.patient_id ?? raw.patientId,
    start_time: start,
    end_time: end,
    status: raw.status ?? "scheduled",
    patient: {
      first_name,
      last_name,
      phone: (raw.patient as Record<string, string>)?.phone,
      email: (raw.patient as Record<string, string>)?.email,
    },
    provider_id: providerId,
    provider: {
      id: providerId,
      color_hex: colorHex,
      user: { full_name: providerName },
      full_name: providerName,
    },
    service: { name_en: serviceName },
  };
}

export function SchedulingClient({ locale }: { locale: string }) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createSlot, setCreateSlot] = useState<{ date: Date; providerId?: string } | null>(null);
  const [checkinsTick, setCheckinsTick] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);

  const range = useMemo(() => {
    let startDate: Date;
    let endDate: Date;
    if (viewMode === "day") {
      startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = getMondayOfWeek(selectedDate);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    }
    return { startDate, endDate };
  }, [selectedDate, viewMode]);

  const appointmentsUrl = useMemo(() => {
    const params = new URLSearchParams({
      start_date: range.startDate.toISOString(),
      end_date: range.endDate.toISOString(),
      _rt: String(refreshTick),
    });
    return `/api/appointments?${params.toString()}`;
  }, [range, refreshTick]);

  const { data: providersData } = useFetch<Provider[]>("/api/providers?compact=1", {
    ttl: 300_000,
    initialData: [],
  });
  const { data: schedulingData, loading } = useParallelFetch<{
    appointments: Appointment[] | { appointments?: Appointment[] };
    checkins: CheckinLite[];
  }>(
    {
      appointments: appointmentsUrl,
      checkins: `/api/reception/checkin?lite=1&_rt=${checkinsTick}`,
    },
    30_000
  );

  useEffect(() => {
    const t = setInterval(() => setCheckinsTick((v) => v + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const raw = schedulingData.appointments;
    const list = Array.isArray(raw) ? raw : raw?.appointments ?? [];
    setAppointments(
      (Array.isArray(list) ? list : []).map((a: Record<string, unknown>) =>
        normalizeAppointment(a)
      )
    );
  }, [schedulingData.appointments]);

  useEffect(() => {
    setProviders(Array.isArray(providersData) ? providersData : []);
  }, [providersData]);

  const checkinStatuses = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of schedulingData.checkins ?? []) {
      if (item.status) {
        map[item.appointment_id] = item.status;
      }
    }
    return map;
  }, [schedulingData.checkins]);

  function refreshAppointments() {
    apiCache.invalidate("/api/appointments?");
    setRefreshTick((v) => v + 1);
  }

  function handleSlotClick(date: Date, providerId?: string) {
    setCreateSlot({ date, providerId });
    setShowCreateForm(true);
    setSelectedAppointment(null);
  }

  function handleAppointmentClick(appt: Appointment) {
    setSelectedAppointment(appt);
    setShowCreateForm(false);
  }

  function navigate(dir: number) {
    const d = new Date(selectedDate);
    if (viewMode === "day") d.setDate(d.getDate() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setSelectedDate(d);
  }

  const dateLabel =
    viewMode === "day"
      ? selectedDate.toLocaleDateString(locale, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : (() => {
          const mon = getMondayOfWeek(selectedDate);
          const sun = new Date(mon);
          sun.setDate(mon.getDate() + 6);
          return `${mon.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${sun.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
        })();

  const isToday = new Date().toDateString() === selectedDate.toDateString();

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-0 gap-6">
      {/* LEFT SIDEBAR */}
      <div className="w-60 shrink-0 flex flex-col gap-4 overflow-y-auto">
        <MiniCalendar
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setViewMode("day");
          }}
          appointments={appointments}
          locale={locale}
        />
        <StatsBar
          appointments={appointments}
          viewMode={viewMode}
          selectedDate={selectedDate}
          locale={locale}
        />

        {providers.length > 0 && (
          <div className="app-card p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Providers
            </p>
            <div className="space-y-1.5">
              {(Array.isArray(providers) ? providers : []).map((p) => (
                <div key={(p.id as string) ?? ""} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: (p.color_hex as string) ?? "#6B7280",
                    }}
                  />
                  <span className="text-xs truncate">
                    {(p.user as Record<string, string> | undefined)?.full_name ?? "Provider"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => {
            setCreateSlot({ date: selectedDate });
            setShowCreateForm(true);
          }}
          className="app-btn-primary w-full px-4 py-2.5 text-sm font-medium transition-colors"
        >
          + New Appointment
        </button>
      </div>

      {/* CENTER — Calendar */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedDate(new Date());
                setViewMode("day");
              }}
              className={`h-9 rounded-xl border px-3 text-xs font-medium transition-colors ${isToday && viewMode === "day" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}
            >
              Today
            </button>
            <button
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="ms-1 text-sm font-semibold text-foreground">{dateLabel}</span>
          </div>
          <div className="flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1">
            <button
              onClick={() => setViewMode("day")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "day" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "week" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              Week
            </button>
          </div>
        </div>

        <div className="app-card flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="h-full p-4 space-y-3 animate-pulse">
              <div className="h-8 w-40 rounded bg-muted" />
              <div className="h-16 rounded bg-muted" />
              <div className="h-16 rounded bg-muted" />
              <div className="h-16 rounded bg-muted" />
            </div>
          ) : viewMode === "day" ? (
            <DayView
              date={selectedDate}
              appointments={appointments}
              providers={providers}
              checkinStatuses={checkinStatuses}
              selectedAppointmentId={selectedAppointment?.id as string | undefined}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
              locale={locale}
            />
          ) : (
            <WeekView
              weekStart={getMondayOfWeek(selectedDate)}
              appointments={appointments}
              selectedDate={selectedDate}
              onSelectDate={(d) => {
                setSelectedDate(d);
                setViewMode("day");
              }}
              onAppointmentClick={handleAppointmentClick}
              locale={locale}
            />
          )}
        </div>
      </div>

      {/* RIGHT SIDEBAR — detail panel */}
      <div className="w-72 shrink-0">
        <AppointmentPanel
          appointment={selectedAppointment}
          locale={locale}
          onClose={() => setSelectedAppointment(null)}
          onStatusChange={(updated) => {
            setSelectedAppointment(updated);
            refreshAppointments();
          }}
          onNewAppointment={() => {
            setCreateSlot({ date: selectedDate });
            setShowCreateForm(true);
          }}
        />
      </div>

      {showCreateForm && (
        <AppointmentFormDrawer
          initialDate={createSlot?.date}
          initialProviderId={createSlot?.providerId}
          providers={providers}
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => {
            setShowCreateForm(false);
            refreshAppointments();
          }}
        />
      )}
    </div>
  );
}
