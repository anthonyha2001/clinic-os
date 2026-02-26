"use client";
import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MiniCalendar } from "./MiniCalendar";
import { StatsBar } from "./StatsBar";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { AppointmentPanel } from "./AppointmentPanel";
import { AppointmentFormDrawer } from "./AppointmentFormDrawer";

type Appointment = Record<string, unknown>;
type Provider = Record<string, unknown>;

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
  const [loading, setLoading] = useState(true);
  const [checkinStatuses, setCheckinStatuses] = useState<Record<string, string>>({});

  const fetchCheckins = useCallback(async () => {
    const res = await fetch("/api/reception/checkin", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const item of data) {
        if (item.checkin_status) {
          map[item.appointment_id] = item.checkin_status;
        }
      }
      setCheckinStatuses(map);
    }
  }, []);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
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

    const params = new URLSearchParams({
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
    });

    const res = await fetch(`/api/appointments?${params}`, {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json();
    const rawList = data.appointments ?? data ?? [];
    const list = Array.isArray(rawList) ? rawList : [];
    setAppointments(list.map((a: Record<string, unknown>) => normalizeAppointment(a)));
    setLoading(false);
  }, [selectedDate, viewMode]);

  useEffect(() => {
    fetch("/api/providers", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const list = d.providers ?? d ?? [];
        setProviders(Array.isArray(list) ? list : []);
      });
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  useEffect(() => {
    fetchCheckins();
  }, [fetchCheckins]);

  useEffect(() => {
    const t = setInterval(fetchCheckins, 15_000);
    return () => clearInterval(t);
  }, [fetchCheckins]);

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
    <div className="flex gap-4 h-[calc(100vh-5rem)] min-h-0">
      {/* LEFT SIDEBAR */}
      <div className="w-56 shrink-0 flex flex-col gap-4 overflow-y-auto">
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
          <div className="rounded-xl border bg-card p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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
          className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          + New Appointment
        </button>
      </div>

      {/* CENTER — Calendar */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex items-center justify-between mb-3 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedDate(new Date());
                setViewMode("day");
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${isToday && viewMode === "day" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
            >
              Today
            </button>
            <button
              onClick={() => navigate(-1)}
              className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="text-sm font-semibold ms-1">{dateLabel}</span>
          </div>
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "day" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Week
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 rounded-xl border bg-card overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-sm text-muted-foreground animate-pulse">
                Loading appointments...
              </div>
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
            fetchAppointments();
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
            fetchAppointments();
          }}
        />
      )}
    </div>
  );
}
