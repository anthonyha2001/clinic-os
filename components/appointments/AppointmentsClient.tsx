"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Stethoscope,
  Undo2,
  User,
  UserCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { MiniCalendar } from "@/components/scheduling/MiniCalendar";
import { DayView } from "@/components/scheduling/DayView";
import { WeekView } from "@/components/scheduling/WeekView";
import { AppointmentPanel } from "@/components/scheduling/AppointmentPanel";
import { AppointmentFormDrawer } from "@/components/scheduling/AppointmentFormDrawer";
import { useFetch, useParallelFetch } from "@/hooks/useFetch";
import { apiCache } from "@/lib/cache/apiCache";
import type { WorkingHours } from "@/types/schedule";

type ViewMode = "day" | "week";
type CheckinFilter = "all" | "not_checked_in" | "waiting" | "in_chair" | "done";
type CheckinStatus = "waiting" | "in_chair" | "done" | "skipped";
type Appointment = Record<string, unknown>;
type Provider = Record<string, unknown>;
type OrgSettings = {
  working_hours?: WorkingHours | null;
};
type ToastState = {
  message: string;
  type: "success" | "error";
  link?: { label: string; href: string };
};
type UndoState = {
  appointmentId: string;
  checkinId: string;
  previousStatus: string | null;
  previousCheckinId: string | null;
  patientName: string;
  action: string;
  expiresAt: number;
};

type QueueAppointment = {
  appointment_id: string;
  start_time: string;
  end_time: string;
  appointment_status: string;
  patient_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string | null;
  provider_id: string;
  provider_name: string;
  provider_color: string;
  provider_specialty: string;
  service_name: string;
  duration: number;
  checkin_id: string | null;
  checkin_status: CheckinStatus | null;
  notes?: string | null;
};

type PatientFile = {
  patient: Record<string, unknown>;
  medical_history: Record<string, unknown> | null;
  dental_chart: { tooth_number: number; conditions: string[]; notes: string }[];
  xrays: {
    file_url: string;
    file_name: string;
    xray_type: string;
    tooth_number: number | null;
    taken_at: string;
  }[];
  appointments: {
    start_time: string;
    service_name: string;
    provider_name: string;
    status: string;
    notes: string;
  }[];
  clinical_notes: {
    note_date: string;
    chief_complaint: string;
    treatment_done: string;
    written_by_name: string;
  }[];
};

const CHECKIN_STYLES: Record<
  CheckinStatus,
  { bg: string; text: string; label: string }
> = {
  waiting: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Waiting" },
  in_chair: { bg: "bg-blue-100", text: "text-blue-700", label: "In Chair" },
  done: { bg: "bg-green-100", text: "text-green-700", label: "Done" },
  skipped: { bg: "bg-gray-100", text: "text-gray-500", label: "Skipped" },
};

const CONDITION_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  cavity: "#ef4444",
  filled: "#3b82f6",
  crown: "#f59e0b",
  missing: "#6b7280",
  root_canal: "#8b5cf6",
  implant: "#06b6d4",
  cracked: "#f97316",
  bridge: "#ec4899",
};

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...6=Sat
  // For Sunday, go back 6 days to get Monday of same display week.
  // For other days, normal Monday calculation.
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizeAppointment(raw: Record<string, unknown>): Appointment {
  const start = (raw.start_time ?? raw.startTime) as string | undefined;
  const end = (raw.end_time ?? raw.endTime) as string | undefined;
  const patientName = (raw.patientName ??
    (raw.patient as Record<string, string>)?.full_name ??
    "") as string;
  const parts = String(patientName).trim().split(/\s+/);
  const first_name = parts[0] ?? "";
  const last_name = parts.slice(1).join(" ") ?? "";
  const providerId = (raw.provider_id ?? raw.providerId) as string | undefined;
  const providerName = (raw.providerName ??
    (raw.provider as Record<string, string>)?.full_name ??
    "") as string;
  const colorHex = (raw.providerColor ??
    (raw.provider as Record<string, unknown>)?.color_hex ??
    "#6B7280") as string;
  const serviceName = (raw.serviceName ??
    (raw.service as Record<string, string>)?.name_en ??
    "") as string;
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

function nowLabel() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppointmentsClient({
  locale,
  initialDate,
}: {
  locale: string;
  initialDate?: string;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => {
    if (!initialDate) return new Date();
    const parsed = new Date(initialDate);
    return !isNaN(parsed.getTime()) ? parsed : new Date();
  });
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("all");
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(
    null
  );
  const [showNewAppointmentForm, setShowNewAppointmentForm] = useState(false);
  const [formSlot, setFormSlot] = useState<{ date: Date; providerId?: string } | null>(
    null
  );
  const [rescheduleTarget, setRescheduleTarget] = useState<QueueAppointment | null>(
    null
  );
  const [checkinFilter, setCheckinFilter] = useState<CheckinFilter>("all");
  const [refreshTick, setRefreshTick] = useState(0);
  const [time, setTime] = useState(nowLabel());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [patientFile, setPatientFile] = useState<PatientFile | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [filePatientName, setFilePatientName] = useState("");
  const [printing, setPrinting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showNoShow, setShowNoShow] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<QueueAppointment | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [checkinFilterDropdownOpen, setCheckinFilterDropdownOpen] = useState(false);

  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const checkinFilterDropdownRef = useRef<HTMLDivElement>(null);

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

  const weekStart = useMemo(() => getMondayOfWeek(selectedDate), [selectedDate]);

  const requests = useMemo(
    () => ({
      appointments: `/api/appointments?start_date=${range.startDate.toISOString()}&end_date=${range.endDate.toISOString()}&_rt=${refreshTick}`,
      receptionWeek: `/api/reception/week?week_start=${weekStart.toISOString().split("T")[0]}&_rt=${refreshTick}`,
      providers: `/api/providers?_rt=${refreshTick}`,
    }),
    [range, weekStart, refreshTick]
  );

  const { data, loading } = useParallelFetch<{
    appointments: Appointment[] | { appointments?: Appointment[] };
    receptionWeek: QueueAppointment[];
    providers: Provider[] | { providers?: Provider[] };
  }>(requests, 30_000);
  const { data: settingsData } = useFetch<OrgSettings>("/api/settings", {
    ttl: 300_000,
  });

  const providers = useMemo(() => {
    const raw = data.providers;
    if (Array.isArray(raw)) return raw;
    return raw?.providers ?? [];
  }, [data.providers]);

  const appointments = useMemo(() => {
    const raw = data.appointments;
    const list = Array.isArray(raw) ? raw : raw?.appointments ?? [];
    return (Array.isArray(list) ? list : []).map((a: Record<string, unknown>) =>
      normalizeAppointment(a)
    );
  }, [data.appointments]);

  const queueAppointments = useMemo(
    () => (Array.isArray(data.receptionWeek) ? data.receptionWeek : []),
    [data.receptionWeek]
  );
  const allQueueData = queueAppointments;

  const checkinStatuses = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of queueAppointments) {
      if (item.checkin_status) {
        map[item.appointment_id] = item.checkin_status;
      }
    }
    return map;
  }, [queueAppointments]);

  const currentDayWorkingHours = useMemo(() => {
    const dayKeys = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ] as const;
    const dayKey = dayKeys[selectedDate.getDay()];
    const daySchedule = settingsData?.working_hours?.[dayKey];
    if (!daySchedule) return null;
    return {
      from: daySchedule.from,
      to: daySchedule.to,
      open: daySchedule.open,
      break_from: daySchedule.break_from ?? null,
      break_to: daySchedule.break_to ?? null,
    };
  }, [selectedDate, settingsData]);

  const filteredAppointments = useMemo(() => {
    if (selectedProviderId === "all") return appointments;
    return appointments.filter((appt) => {
      const providerId = (appt.provider_id ??
        (appt.provider as Record<string, unknown>)?.id) as string | undefined;
      return providerId === selectedProviderId;
    });
  }, [appointments, selectedProviderId]);

  const selectedDayQueue = useMemo(() => {
    const day = selectedDate.toDateString();
    return queueAppointments.filter(
      (a) => new Date(a.start_time).toDateString() === day
    );
  }, [queueAppointments, selectedDate]);

  const filteredQueue = useMemo(() => {
    if (checkinFilter === "all") return selectedDayQueue;
    if (checkinFilter === "not_checked_in")
      return selectedDayQueue.filter((q) => !q.checkin_id);
    if (checkinFilter === "waiting") {
      return selectedDayQueue.filter(
        (q) => !q.checkin_id || q.checkin_status === "waiting"
      );
    }
    return selectedDayQueue.filter((q) => q.checkin_status === checkinFilter);
  }, [selectedDayQueue, checkinFilter]);
  const sortedQueue = useMemo(
    () =>
      [...filteredQueue].sort((a, b) => {
        const aDone = a.checkin_status === "done" || a.checkin_status === "skipped";
        const bDone = b.checkin_status === "done" || b.checkin_status === "skipped";
        if (aDone && !bDone) return 1;
        if (!aDone && bDone) return -1;
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      }),
    [filteredQueue]
  );
  const activeQueue = useMemo(
    () =>
      sortedQueue.filter(
        (item) =>
          item.appointment_status !== "canceled" &&
          item.checkin_status !== "done" &&
          item.checkin_status !== "skipped"
      ),
    [sortedQueue]
  );
  const completedQueue = useMemo(
    () =>
      sortedQueue.filter(
        (item) => item.checkin_status === "done" || item.checkin_status === "skipped"
      ),
    [sortedQueue]
  );
  const canceledQueue = useMemo(
    () =>
      allQueueData.filter(
        (item) =>
          new Date(item.start_time).toDateString() === selectedDate.toDateString() &&
          item.appointment_status === "canceled"
      ),
    [allQueueData, selectedDate]
  );
  const noShowQueue = useMemo(
    () =>
      filteredAppointments
        .filter((a) => {
          const start = (a.start_time ?? a.startTime) as string | undefined;
          return (
            !!start &&
            new Date(start).toDateString() === selectedDate.toDateString() &&
            String(a.status ?? "").toLowerCase() === "no_show"
          );
        })
        .map((a) => {
          const provider = (a.provider as Record<string, unknown> | undefined) ?? {};
          const patient = (a.patient as Record<string, unknown> | undefined) ?? {};
          const service = (a.service as Record<string, unknown> | undefined) ?? {};
          return {
            appointment_id: String(a.id ?? ""),
            start_time: String(a.start_time ?? a.startTime ?? ""),
            end_time: String(a.end_time ?? a.endTime ?? ""),
            appointment_status: "no_show",
            patient_id: String(a.patient_id ?? ""),
            first_name: String(patient.first_name ?? ""),
            last_name: String(patient.last_name ?? ""),
            phone: String(patient.phone ?? ""),
            date_of_birth: null,
            provider_id: String(a.provider_id ?? provider.id ?? ""),
            provider_name: String(
              ((provider.user as Record<string, unknown> | undefined)?.full_name as string | undefined) ??
                (provider.full_name as string | undefined) ??
                "Provider"
            ),
            provider_color: String(provider.color_hex ?? "#6b7280"),
            provider_specialty: "",
            service_name: String(service.name_en ?? "General"),
            duration: 0,
            checkin_id: null,
            checkin_status: "skipped" as CheckinStatus,
            notes: (a.notes as string | null | undefined) ?? null,
          } satisfies QueueAppointment;
        }),
    [filteredAppointments, selectedDate]
  );

  const dayQueue = selectedDayQueue;
  const notCheckedIn = dayQueue.filter((q) => !q.checkin_id).length;
  const waitingCount = dayQueue.filter((q) => q.checkin_status === "waiting").length;
  const inChairCount = dayQueue.filter((q) => q.checkin_status === "in_chair").length;
  const doneCount = dayQueue.filter((q) => q.checkin_status === "done").length;

  function refreshAll() {
    apiCache.invalidate("/api/appointments?");
    apiCache.invalidate("/api/reception/week?");
    apiCache.invalidate("/api/providers");
    setRefreshTick((v) => v + 1);
  }

  useEffect(() => {
    const t = setInterval(() => setTime(nowLabel()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(refreshAll, 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setOpenMenuId(null);
        setMenuPosition(null);
      }
      if (
        filterDropdownOpen &&
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(target)
      ) {
        setFilterDropdownOpen(false);
      }
      if (
        checkinFilterDropdownOpen &&
        checkinFilterDropdownRef.current &&
        !checkinFilterDropdownRef.current.contains(target)
      ) {
        setCheckinFilterDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterDropdownOpen, checkinFilterDropdownOpen]);
  useEffect(() => {
    if (checkinFilter === "done") {
      setShowCompleted(true);
    }
  }, [checkinFilter]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "appointments-print-styles";
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #patient-file-print { display: block !important; }
      }
      #patient-file-print { display: none; }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById("appointments-print-styles")?.remove();
    };
  }, []);
  async function handleCheckin(appointmentId: string, patientName: string) {
    setActionLoading(appointmentId);
    try {
      const res = await fetch("/api/reception/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ appointment_id: appointmentId }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("Checkin failed:", text);
        setToast({ message: "Failed to check in patient", type: "error" });
      } else {
        const data = (await res.json()) as { id?: string };
        if (data.id) {
          setUndoState({
            appointmentId,
            checkinId: data.id,
            previousStatus: null,
            previousCheckinId: null,
            patientName,
            action: "Check In",
            expiresAt: Date.now() + 5000,
          });
        }
      }
      refreshAll();
    } catch (e) {
      console.error("Checkin error:", e);
      setToast({ message: "Network error", type: "error" });
    } finally {
      setActionLoading(null);
    }
  }

  async function updateStatus(
    checkinId: string,
    status: CheckinStatus,
    appointmentId: string,
    patientName: string,
    previousStatus: string
  ) {
    setActionLoading(checkinId);
    try {
      const res = await fetch(`/api/reception/checkin/${checkinId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Status update failed:", text);
        setToast({ message: "Failed to update status", type: "error" });
        return;
      }

      const data = (await res.json()) as {
        invoice_created?: boolean;
        invoice_id?: string;
      };
      if (status === "done" && (data.invoice_created || data.invoice_id)) {
        window.dispatchEvent(new Event("billing:invoice-from-appointment"));
      }
      if (status === "done") {
        const invoiceId = data.invoice_id as string | undefined;
        setToast({
          message: data.invoice_created
            ? "✅ Invoice created automatically"
            : "✅ Appointment completed",
          type: "success",
          link: invoiceId
            ? {
                label: "View Invoice →",
                href: `/${locale}/billing/${invoiceId}`,
              }
            : undefined,
        });
      }

      setUndoState({
        appointmentId,
        checkinId,
        previousStatus,
        previousCheckinId: checkinId,
        patientName,
        action: status === "in_chair" ? "Call In" : "Done",
        expiresAt: Date.now() + 5000,
      });

      refreshAll();
    } catch (e) {
      console.error("Status update error:", e);
      setToast({ message: "Network error", type: "error" });
    } finally {
      setActionLoading(null);
    }
  }
  async function handleUndo() {
    if (!undoState) return;
    const currentUndo = undoState;
    setUndoState(null);
    try {
      if (currentUndo.previousStatus === null) {
        await fetch(`/api/reception/checkin/${currentUndo.checkinId}`, {
          method: "DELETE",
          credentials: "include",
        });
      } else {
        await fetch(`/api/reception/checkin/${currentUndo.checkinId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: currentUndo.previousStatus }),
        });
      }
      refreshAll();
    } catch (e) {
      console.error("Undo failed:", e);
      setToast({ message: "Failed to undo action", type: "error" });
    }
  }
  async function handleNoShow(appointmentId: string, patientName: string) {
    setActionLoading(appointmentId);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "no_show" }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("No-show update failed:", text);
        setToast({ message: "Failed to mark no-show", type: "error" });
        return;
      }
      setToast({
        message: `✅ Marked ${patientName} as no-show`,
        type: "success",
      });
      refreshAll();
    } catch (e) {
      console.error("No-show update error:", e);
      setToast({ message: "Network error", type: "error" });
    } finally {
      setActionLoading(null);
    }
  }
  async function handleCancel(appointmentId: string, patientName: string) {
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "canceled" }),
      });
      if (!res.ok) {
        setToast({ message: "Failed to cancel appointment", type: "error" });
        return;
      }
      setToast({
        message: `Appointment for ${patientName} canceled`,
        type: "success",
      });
      refreshAll();
    } catch {
      setToast({ message: "Network error", type: "error" });
    } finally {
      setCancelLoading(false);
      setCancelTarget(null);
    }
  }

  async function openPatientFile(patientId: string, name: string) {
    setFileLoading(true);
    setFilePatientName(name);
    setPatientFile(null);
    const res = await fetch(`/api/reception/patient-file/${patientId}`, {
      credentials: "include",
    });
    if (res.ok) setPatientFile((await res.json()) as PatientFile);
    setFileLoading(false);
  }

  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 300);
  }

  const headerDate = new Date().toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  function renderQueueItem(item: QueueAppointment) {
    const status = item.checkin_status;
    const style = status ? CHECKIN_STYLES[status] : null;
    const patientName = `${item.first_name} ${item.last_name}`;
    const isLoading =
      actionLoading !== null &&
      (actionLoading === item.appointment_id || actionLoading === item.checkin_id);
    const apptTime = new Date(item.start_time).toLocaleTimeString(locale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const isToday = new Date(item.start_time).toDateString() === new Date().toDateString();
    const isCheckedIn = Boolean(item.checkin_id);
    const quickActionType =
      isToday && !isCheckedIn
        ? "checkin"
        : isToday && status === "waiting"
          ? "callin"
          : isToday && status === "in_chair"
            ? "done"
            : null;
    const isLate = !isCheckedIn && isToday && new Date(item.start_time) < new Date();
    const age = item.date_of_birth
      ? Math.floor(
          (Date.now() - new Date(item.date_of_birth).getTime()) /
            (365.25 * 24 * 60 * 60 * 1000)
        )
      : null;

    return (
      <div key={item.appointment_id} className="px-4 py-3 border-b hover:bg-muted/20 transition-colors">
        <div className="flex gap-3">
          <div className="shrink-0 w-14 self-center text-right">
            <p
              className={`text-xs font-bold font-mono ${
                isLate ? "text-red-500" : "text-foreground"
              }`}
            >
              {apptTime}
            </p>
            {isLate && <p className="text-[10px] text-red-400">Late</p>}
          </div>

          <div
            className="shrink-0 w-0.5 rounded-full self-stretch my-0.5"
            style={{ backgroundColor: item.provider_color ?? "#6b7280" }}
          />

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold">
                {item.first_name} {item.last_name}
              </p>
              {age != null && <span className="text-xs text-muted-foreground">{age}y</span>}
              {style && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}
                >
                  {style.label}
                </span>
              )}

              {quickActionType === "checkin" && (
                <button
                  onClick={() => handleCheckin(item.appointment_id, patientName)}
                  disabled={isLoading}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <UserCheck className="size-3" />
                  )}
                  Check In
                </button>
              )}
              {quickActionType === "callin" && (
                <button
                  onClick={() =>
                    item.checkin_id &&
                    updateStatus(
                      item.checkin_id,
                      "in_chair",
                      item.appointment_id,
                      patientName,
                      "waiting"
                    )
                  }
                  disabled={isLoading}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-blue-600 text-white px-2 py-0.5 text-[10px] font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Stethoscope className="size-3" />
                  )}
                  Call In
                </button>
              )}
              {quickActionType === "done" && (
                <button
                  onClick={() =>
                    item.checkin_id &&
                    updateStatus(
                      item.checkin_id,
                      "done",
                      item.appointment_id,
                      patientName,
                      "in_chair"
                    )
                  }
                  disabled={isLoading}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-green-600 text-white px-2 py-0.5 text-[10px] font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <CheckCircle className="size-3" />
                  )}
                  Done
                </button>
              )}

              <div
                className="relative shrink-0 ml-auto overflow-visible"
                ref={openMenuId === item.appointment_id ? menuRef : null}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (openMenuId === item.appointment_id) {
                      setOpenMenuId(null);
                      setMenuPosition(null);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenuPosition({
                        top: rect.bottom + 4,
                        right: window.innerWidth - rect.right,
                      });
                      setOpenMenuId(item.appointment_id);
                    }
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border hover:bg-muted text-muted-foreground transition-colors"
                >
                  <MoreHorizontal className="size-4" />
                </button>

                {openMenuId === item.appointment_id && menuPosition && (
                  <div
                    className="fixed z-[9999] w-44 rounded-xl border bg-white shadow-xl py-1 animate-in fade-in-0 zoom-in-95 duration-100"
                    style={{
                      top: menuPosition.top,
                      right: menuPosition.right,
                    }}
                  >
                    {isToday &&
                      item.checkin_status !== "done" &&
                      item.checkin_status !== "skipped" &&
                      item.appointment_status !== "no_show" &&
                      item.appointment_status !== "canceled" &&
                      item.appointment_status !== "completed" && (
                        <button
                          onClick={() => {
                            handleNoShow(item.appointment_id, patientName);
                            setOpenMenuId(null);
                            setMenuPosition(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-red-600"
                        >
                          {isLoading ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <AlertCircle className="size-3.5" />
                          )}
                          No Show
                        </button>
                      )}

                    {undoState?.appointmentId === item.appointment_id && (
                      <>
                        <div className="h-px bg-border mx-2 my-1" />
                        <button
                          onClick={() => {
                            handleUndo();
                            setOpenMenuId(null);
                            setMenuPosition(null);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-orange-600"
                        >
                          <Undo2 className="size-3.5" />
                          Undo {undoState.action}
                        </button>
                      </>
                    )}

                    <div className="h-px bg-border mx-2 my-1" />

                    <button
                      onClick={() => {
                        setRescheduleTarget(item);
                        setFormSlot(null);
                        setShowNewAppointmentForm(true);
                        setOpenMenuId(null);
                        setMenuPosition(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-muted-foreground"
                    >
                      <Calendar className="size-3.5" />
                      Reschedule
                    </button>

                    <button
                      onClick={() => {
                        openPatientFile(item.patient_id, patientName);
                        setOpenMenuId(null);
                        setMenuPosition(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-muted-foreground"
                    >
                      <FileText className="size-3.5" />
                      View File
                    </button>

                    <button
                      onClick={() => {
                        router.push(`/${locale}/patients/${item.patient_id}`);
                        setOpenMenuId(null);
                        setMenuPosition(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted transition-colors text-left text-muted-foreground"
                    >
                      <ChevronRight className="size-3.5" />
                      View Patient
                    </button>

                    <div className="h-px bg-border mx-2 my-1" />
                    <button
                      onClick={() => {
                        setCancelTarget(item);
                        setOpenMenuId(null);
                        setMenuPosition(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-red-50 transition-colors text-left text-red-600"
                    >
                      <X className="size-3.5" />
                      Cancel Appointment
                    </button>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {item.service_name || "General"} · {item.provider_name}
            </p>

            {item.phone && (
              <a
                href={`tel:${item.phone}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Phone className="size-3" />
                {item.phone}
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h1 className="text-2xl font-bold">Appointments</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {headerDate} · <span className="font-mono">{time}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
            >
              <RefreshCw className="size-4" />
              Refresh
            </button>
            <button
              onClick={() => {
                setRescheduleTarget(null);
                setFormSlot({ date: selectedDate });
                setShowNewAppointmentForm(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:opacity-90"
            >
              <Plus className="size-4" />
              New Appointment
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-4 min-h-0">
          <aside
            className="sticky top-4 w-80 shrink-0 self-start flex flex-col gap-4"
            style={{ height: "calc(100vh - 120px)" }}
          >
            <div className="shrink-0 flex flex-col gap-3">
              <MiniCalendar
                selectedDate={selectedDate}
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  setViewMode("day");
                }}
                appointments={filteredAppointments}
                locale={locale}
              />
              <div className="relative" ref={checkinFilterDropdownRef}>
                <button
                  onClick={() => setCheckinFilterDropdownOpen((v) => !v)}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    checkinFilter !== "all"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title="Filter queue by status"
                >
                  <Filter className="size-4" />
                  {checkinFilter === "all"
                    ? "All"
                    : checkinFilter === "not_checked_in"
                      ? "Not Checked In"
                      : checkinFilter === "waiting"
                        ? "Waiting"
                        : checkinFilter === "in_chair"
                          ? "In Chair"
                          : "Done"}
                </button>
                {checkinFilterDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border bg-card p-2 shadow-lg">
                    {[
                      {
                        label: "All",
                        filter: "all" as const,
                        icon: Calendar,
                        color: "text-muted-foreground",
                      },
                      {
                        label: "Not Checked In",
                        filter: "not_checked_in" as const,
                        subLabel: `(${notCheckedIn})`,
                        icon: AlertCircle,
                        color: "text-orange-500",
                      },
                      {
                        label: "Waiting",
                        filter: "waiting" as const,
                        subLabel: `(${waitingCount})`,
                        icon: Clock,
                        color: "text-yellow-500",
                      },
                      {
                        label: "In Chair",
                        filter: "in_chair" as const,
                        subLabel: `(${inChairCount})`,
                        icon: Stethoscope,
                        color: "text-blue-500",
                      },
                      {
                        label: "Done",
                        filter: "done" as const,
                        subLabel: `(${doneCount})`,
                        icon: CheckCircle,
                        color: "text-green-500",
                      },
                    ].map(({ label, filter, subLabel, icon: Icon, color }) => {
                      const isAllOption = label === "All";
                      const active =
                        isAllOption
                          ? checkinFilter === "all"
                          : checkinFilter === filter;
                      return (
                        <button
                          key={label}
                          onClick={() => {
                            setCheckinFilter(filter);
                            setCheckinFilterDropdownOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                            active ? "bg-primary/10 text-primary" : ""
                          }`}
                        >
                          <Icon className={`size-4 shrink-0 ${color}`} />
                          <span>
                            {label}
                            {subLabel && (
                              <span className="text-muted-foreground">
                                {" "}
                                {subLabel}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 rounded-xl border bg-card flex flex-col"
            style={{ minHeight: "320px" }}>
              <div className="shrink-0 border-b px-4 py-3 bg-muted/30">
                <h2 className="text-sm font-semibold">
                  {selectedDate.toDateString() === new Date().toDateString()
                    ? "Today's Queue"
                    : selectedDate.toLocaleDateString(locale, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {selectedDate.toLocaleDateString(locale, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {filteredQueue.length} appointments
                </p>
              </div>
              <div
                className="flex-1 overflow-y-auto sidebar-scroll"
                style={{ minHeight: "260px" }}
              >
                {loading ? (
                  <div className="p-4 space-y-2 animate-pulse">
                    <div className="h-16 rounded bg-muted" />
                    <div className="h-16 rounded bg-muted" />
                    <div className="h-16 rounded bg-muted" />
                  </div>
                ) : activeQueue.length === 0 &&
                  completedQueue.length === 0 &&
                  canceledQueue.length === 0 &&
                  noShowQueue.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No appointments for this filter.
                  </div>
                ) : (
                  <div>
                    {activeQueue.map((item) => renderQueueItem(item))}

                    {completedQueue.length > 0 && (
                      <div className="border-t">
                        <button
                          onClick={() => setShowCompleted((v) => !v)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <CheckCircle className="size-3.5 text-green-500" />
                            <span className="text-xs font-medium text-muted-foreground">
                              Completed ({completedQueue.length})
                            </span>
                          </div>
                          <ChevronDown
                            className={`size-3.5 text-muted-foreground transition-transform duration-200 ${
                              showCompleted ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {showCompleted && (
                          <div className="border-t divide-y bg-muted/10">
                            {completedQueue.map((item) => renderQueueItem(item))}
                          </div>
                        )}
                      </div>
                    )}

                    {canceledQueue.length > 0 && (
                      <div className="border-t">
                        <button
                          onClick={() => setShowCanceled((v) => !v)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <X className="size-3.5 text-muted-foreground/50" />
                            <span className="text-xs font-medium text-muted-foreground/70">
                              Canceled ({canceledQueue.length})
                            </span>
                          </div>
                          <ChevronDown
                            className={`size-3.5 text-muted-foreground/50 transition-transform duration-200 ${
                              showCanceled ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {showCanceled && (
                          <div className="border-t divide-y bg-muted/5">
                            {canceledQueue.map((item) => (
                              <div key={item.appointment_id} className="px-4 py-3 opacity-50">
                                <div className="flex items-center gap-3">
                                  <div className="w-14 shrink-0 text-center">
                                    <p className="text-xs font-mono text-muted-foreground">
                                      {new Date(item.start_time).toLocaleTimeString(locale, {
                                        hour: "numeric",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                    </p>
                                  </div>

                                  <div className="w-0.5 h-8 rounded-full shrink-0 bg-muted-foreground/30" />

                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-muted-foreground truncate line-through">
                                      {item.first_name} {item.last_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground/60 truncate">
                                      {item.service_name} · {item.provider_name}
                                    </p>
                                  </div>

                                  <span className="text-[10px] font-medium text-muted-foreground/60 shrink-0 border border-border/40 rounded-full px-2 py-0.5">
                                    Canceled
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {noShowQueue.length > 0 && (
                      <div className="border-t">
                        <button
                          onClick={() => setShowNoShow((v) => !v)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <AlertCircle className="size-3.5 text-red-500" />
                            <span className="text-xs font-medium text-muted-foreground">
                              No Show ({noShowQueue.length})
                            </span>
                          </div>
                          <ChevronDown
                            className={`size-3.5 text-muted-foreground transition-transform duration-200 ${
                              showNoShow ? "rotate-180" : ""
                            }`}
                          />
                        </button>

                        {showNoShow && (
                          <div className="border-t divide-y bg-muted/10">
                            {noShowQueue.map((item) => renderQueueItem(item))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </aside>

          <section className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-end gap-2">
                <div className="flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1">
                  <button
                    onClick={() => setViewMode("day")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === "day"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    Day
                  </button>
                  <button
                    onClick={() => setViewMode("week")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      viewMode === "week"
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    Week
                  </button>
                </div>

                <div className="relative" ref={filterDropdownRef}>
                  <button
                    onClick={() => setFilterDropdownOpen((v) => !v)}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                      selectedProviderId !== "all"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    title="Filter by provider"
                  >
                    <Filter className="size-4" />
                  </button>
                  {filterDropdownOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-xl border border-border bg-card p-2 shadow-lg">
                      <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                        Provider
                      </p>
                      <select
                        value={selectedProviderId}
                        onChange={(e) => {
                          setSelectedProviderId(e.target.value);
                          setFilterDropdownOpen(false);
                        }}
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="all">All Providers</option>
                        {providers.map((p) => (
                          <option
                            key={String(p.id ?? "")}
                            value={String(p.id ?? "")}
                          >
                            {(p.user as Record<string, string> | undefined)
                              ?.full_name ??
                              (p.full_name as string) ??
                              "Provider"}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
            </div>

            <div className="relative flex gap-4" style={{ height: "calc(100vh - 220px)", minHeight: "640px" }}>
              <div className="min-w-0 flex-1 app-card overflow-hidden flex flex-col">
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
                    appointments={filteredAppointments}
                    providers={providers}
                    checkinStatuses={checkinStatuses}
                    workingHours={currentDayWorkingHours}
                    selectedAppointmentId={selectedAppointment?.id as string | undefined}
                    onSlotClick={(slotDate, providerId) => {
                      setFormSlot({ date: slotDate, providerId });
                      setShowNewAppointmentForm(true);
                      setSelectedAppointment(null);
                    }}
                    onAppointmentClick={(appt) => {
                      setSelectedAppointment(appt);
                    }}
                    locale={locale}
                  />
                ) : (
                  <WeekView
                    weekStart={getMondayOfWeek(selectedDate)}
                    appointments={filteredAppointments}
                    selectedDate={selectedDate}
                    onSelectDate={(d) => {
                      setSelectedDate(d);
                      setViewMode("day");
                    }}
                    onAppointmentClick={(appt) => setSelectedAppointment(appt)}
                    locale={locale}
                  />
                )}
              </div>

              {selectedAppointment && (
                <div
                  className="fixed inset-y-0 right-0 z-50 w-72 p-2 md:static md:inset-auto md:z-auto md:w-72 md:p-0 md:shrink-0"
                >
                  <AppointmentPanel
                    appointment={selectedAppointment}
                    locale={locale}
                    onClose={() => setSelectedAppointment(null)}
                    onStatusChange={(updated) => {
                      setSelectedAppointment(updated);
                      refreshAll();
                    }}
                    onNewAppointment={() => {
                      setFormSlot({ date: selectedDate });
                      setShowNewAppointmentForm(true);
                    }}
                  />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {showNewAppointmentForm && (
        <AppointmentFormDrawer
          initialDate={
            rescheduleTarget
              ? new Date(rescheduleTarget.start_time)
              : (formSlot?.date ?? selectedDate)
          }
          initialProviderId={rescheduleTarget?.provider_id ?? formSlot?.providerId}
          initialPatientId={rescheduleTarget?.patient_id}
          initialPatientName={
            rescheduleTarget
              ? `${rescheduleTarget.first_name} ${rescheduleTarget.last_name}`
              : undefined
          }
          editingAppointment={
            rescheduleTarget
              ? {
                  id: rescheduleTarget.appointment_id,
                  start_time: rescheduleTarget.start_time,
                  end_time: rescheduleTarget.end_time,
                  provider_id: rescheduleTarget.provider_id,
                  notes: rescheduleTarget.notes ?? null,
                }
              : null
          }
          providers={providers}
          onClose={() => {
            setShowNewAppointmentForm(false);
            setRescheduleTarget(null);
          }}
          onSuccess={() => {
            setShowNewAppointmentForm(false);
            refreshAll();
            setToast({
              message: rescheduleTarget
                ? "✅ Appointment rescheduled"
                : "✅ Appointment created",
              type: "success",
            });
            setRescheduleTarget(null);
          }}
        />
      )}

      {(patientFile || fileLoading) && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => !fileLoading && setPatientFile(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="size-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-bold">{filePatientName}</h2>
                    <p className="text-xs text-muted-foreground">Medical File</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    disabled={printing || fileLoading}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {printing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Printer className="size-4" />
                    )}
                    Print / PDF
                  </button>
                  <button
                    onClick={() => setPatientFile(null)}
                    className="p-2 rounded-lg hover:bg-muted"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              </div>

              {fileLoading ? (
                <div className="flex-1 flex items-center justify-center p-12">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              ) : (
                patientFile && (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={printRef}>
                    <section>
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                        Patient Information
                      </h3>
                      <div className="grid grid-cols-3 gap-4 rounded-xl border p-4 bg-muted/20">
                        {[
                          {
                            label: "Full Name",
                            value: `${String(
                              patientFile.patient.first_name ?? ""
                            )} ${String(patientFile.patient.last_name ?? "")}`.trim(),
                          },
                          {
                            label: "Phone",
                            value: String(patientFile.patient.phone ?? "—"),
                          },
                          {
                            label: "Date of Birth",
                            value: patientFile.patient.date_of_birth
                              ? new Date(
                                  patientFile.patient.date_of_birth as string
                                ).toLocaleDateString()
                              : "—",
                          },
                          {
                            label: "Gender",
                            value: (patientFile.patient.gender as string) || "—",
                          },
                          {
                            label: "Email",
                            value: (patientFile.patient.email as string) || "—",
                          },
                          {
                            label: "Address",
                            value: (patientFile.patient.address as string) || "—",
                          },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-sm font-medium mt-0.5">{value}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    {patientFile.medical_history && (
                      <section>
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                          Medical History
                        </h3>
                        <div className="rounded-xl border p-4 space-y-3">
                          {(patientFile.medical_history.allergies as string[] | undefined)
                            ?.length ? (
                            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                              <p className="text-xs font-semibold text-red-700">
                                ⚠️ Allergies
                              </p>
                              <p className="text-sm text-red-700 mt-0.5">
                                {(
                                  patientFile.medical_history.allergies as string[]
                                ).join(", ")}
                              </p>
                            </div>
                          ) : null}
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              {
                                label: "Blood Type",
                                value:
                                  (patientFile.medical_history.blood_type as string) ||
                                  "Unknown",
                              },
                              {
                                label: "Diabetic",
                                value: patientFile.medical_history.diabetic
                                  ? "Yes ⚠️"
                                  : "No",
                              },
                              {
                                label: "Hypertensive",
                                value: patientFile.medical_history.hypertensive
                                  ? "Yes ⚠️"
                                  : "No",
                              },
                              {
                                label: "Heart Condition",
                                value: patientFile.medical_history.heart_condition
                                  ? "Yes ⚠️"
                                  : "No",
                              },
                              {
                                label: "Smoker",
                                value: patientFile.medical_history.smoking ? "Yes" : "No",
                              },
                              {
                                label: "Pregnant",
                                value: patientFile.medical_history.pregnant
                                  ? "Yes ⚠️"
                                  : "No",
                              },
                            ].map(({ label, value }) => (
                              <div key={label}>
                                <p className="text-xs text-muted-foreground">{label}</p>
                                <p className="text-sm font-medium mt-0.5">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    )}

                    {patientFile.dental_chart.length > 0 && (
                      <section>
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                          Dental Chart
                        </h3>
                        <div className="rounded-xl border p-4">
                          <div className="flex flex-wrap gap-1.5">
                            {patientFile.dental_chart.map((tooth) => (
                              <div
                                key={tooth.tooth_number}
                                className="flex flex-col items-center gap-0.5"
                              >
                                <span className="text-[9px] text-muted-foreground">
                                  {tooth.tooth_number}
                                </span>
                                <div
                                  className="h-6 w-5 rounded-sm border"
                                  style={{
                                    backgroundColor: tooth.conditions[0]
                                      ? CONDITION_COLORS[tooth.conditions[0]] ?? "#e5e7eb"
                                      : "#e5e7eb",
                                  }}
                                  title={tooth.conditions.join(", ")}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>
                    )}

                    {patientFile.xrays.length > 0 && (
                      <section>
                        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                          X-Rays ({patientFile.xrays.length})
                        </h3>
                        <div className="grid grid-cols-4 gap-2">
                          {patientFile.xrays.map((xray, i) => (
                            <div key={i} className="rounded-xl overflow-hidden border bg-black">
                              <img
                                src={xray.file_url}
                                alt={xray.file_name}
                                className="w-full h-20 object-cover opacity-90"
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    <section>
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                        Visit History ({patientFile.appointments.length})
                      </h3>
                      <div className="rounded-xl border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                                Date
                              </th>
                              <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                                Service
                              </th>
                              <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                                Provider
                              </th>
                              <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {patientFile.appointments.map((appt, i) => (
                              <tr
                                key={i}
                                className="border-b last:border-0 hover:bg-muted/20"
                              >
                                <td className="px-3 py-2 text-xs">
                                  {new Date(appt.start_time).toLocaleDateString()}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {appt.service_name || "—"}
                                </td>
                                <td className="px-3 py-2 text-xs">{appt.provider_name}</td>
                                <td className="px-3 py-2 text-xs capitalize">
                                  {appt.status}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                )
              )}
            </div>
          </div>
        </>
      )}

      <div id="patient-file-print" className="p-8 max-w-4xl mx-auto">
        {patientFile && (
          <>
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold">Patient Medical File</h1>
                <p className="text-gray-500">{filePatientName}</p>
              </div>
            </div>
            <div>
              <h2 className="font-bold mb-2 text-sm uppercase text-gray-500 border-b pb-1">
                Visit History
              </h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 pr-4">Date</th>
                    <th className="text-left py-1 pr-4">Service</th>
                    <th className="text-left py-1 pr-4">Provider</th>
                    <th className="text-left py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patientFile.appointments.map((appt, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1 pr-4">
                        {new Date(appt.start_time).toLocaleDateString()}
                      </td>
                      <td className="py-1 pr-4">{appt.service_name || "—"}</td>
                      <td className="py-1 pr-4">{appt.provider_name}</td>
                      <td className="py-1 capitalize">{appt.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          <span>{toast.message}</span>
          {toast.link && (
            <a
              href={toast.link.href}
              className="shrink-0 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-1 text-xs font-bold text-white transition-colors whitespace-nowrap"
              onClick={() => setToast(null)}
            >
              {toast.link.label}
            </a>
          )}
          <button
            onClick={() => setToast(null)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !cancelLoading && setCancelTarget(null)}
          />

          <div className="relative z-10 w-full max-w-sm rounded-2xl border bg-card shadow-2xl p-6 animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <X className="size-5 text-red-600" />
              </div>

              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">Cancel Appointment</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Are you sure you want to cancel the appointment for{" "}
                  <strong className="text-foreground">
                    {cancelTarget.first_name} {cancelTarget.last_name}
                  </strong>{" "}
                  at{" "}
                  <strong className="text-foreground">
                    {new Date(cancelTarget.start_time).toLocaleTimeString(locale, {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </strong>
                  ? This cannot be undone.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setCancelTarget(null)}
                disabled={cancelLoading}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Keep Appointment
              </button>
              <button
                onClick={() =>
                  handleCancel(
                    cancelTarget.appointment_id,
                    `${cancelTarget.first_name} ${cancelTarget.last_name}`
                  )
                }
                disabled={cancelLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelLoading ? <Loader2 className="size-4 animate-spin" /> : null}
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
