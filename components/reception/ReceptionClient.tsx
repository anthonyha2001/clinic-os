"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Clock, UserCheck, Stethoscope, CheckCircle,
  RefreshCw, Plus, Phone, Calendar, ChevronRight,
  AlertCircle, Loader2, ChevronLeft, FileText,
  Printer, X, User, Activity
} from "lucide-react";
import { useFetch } from "@/hooks/useFetch";
import { apiCache } from "@/lib/cache/apiCache";

type CheckinStatus = "waiting" | "in_chair" | "done" | "skipped";

type Appointment = {
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
};

type PatientFile = {
  patient: Record<string, unknown>;
  medical_history: Record<string, unknown> | null;
  dental_chart: { tooth_number: number; conditions: string[]; notes: string }[];
  xrays: { file_url: string; file_name: string; xray_type: string; tooth_number: number | null; taken_at: string }[];
  appointments: { start_time: string; service_name: string; provider_name: string; status: string; notes: string }[];
  clinical_notes: { note_date: string; chief_complaint: string; treatment_done: string; written_by_name: string }[];
};

const CHECKIN_STYLES: Record<CheckinStatus, { bg: string; text: string; label: string }> = {
  waiting:  { bg: "bg-yellow-100", text: "text-yellow-700", label: "Waiting" },
  in_chair: { bg: "bg-blue-100",   text: "text-blue-700",   label: "In Chair" },
  done:     { bg: "bg-green-100",  text: "text-green-700",  label: "Done" },
  skipped:  { bg: "bg-gray-100",   text: "text-gray-500",   label: "Skipped" },
};

const CONDITION_COLORS: Record<string, string> = {
  healthy: "#22c55e", cavity: "#ef4444", filled: "#3b82f6",
  crown: "#f59e0b", missing: "#6b7280", root_canal: "#8b5cf6",
  implant: "#06b6d4", cracked: "#f97316", bridge: "#ec4899",
};

function getWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function getMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ReceptionClient({ locale }: { locale: string }) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [allAppts, setAllAppts] = useState<Appointment[]>([]);
  const [todayQueue, setTodayQueue] = useState<Appointment[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [time, setTime] = useState(now());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | CheckinStatus>("all");
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [patientFile, setPatientFile] = useState<PatientFile | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [filePatientName, setFilePatientName] = useState("");
  const [printing, setPrinting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const t = setInterval(() => setTime(now()), 1000);
    return () => clearInterval(t);
  }, []);

  const weekStartStr = useMemo(() => weekStart.toISOString().split("T")[0], [weekStart]);
  const { data: weekData, loading, refetch: refetchWeek } = useFetch<Appointment[]>(
    `/api/reception/week?week_start=${weekStartStr}&_rt=${refreshTick}`,
    { ttl: 30_000, initialData: [] }
  );

  useEffect(() => {
    const list = Array.isArray(weekData) ? weekData : [];
    setAllAppts(list);
    const todayStr = new Date().toDateString();
    setTodayQueue(list.filter((a) => new Date(a.start_time).toDateString() === todayStr));
  }, [weekData]);

  function refreshWeek() {
    apiCache.invalidate("/api/reception/week?");
    setRefreshTick((v) => v + 1);
    refetchWeek();
  }

  useEffect(() => {
    const t = setInterval(refreshWeek, 30_000);
    return () => clearInterval(t);
  }, []);

  // Update today's queue when selected day changes
  useEffect(() => {
    const dayStr = selectedDay.toDateString();
    setTodayQueue(allAppts.filter(a => new Date(a.start_time).toDateString() === dayStr));
  }, [selectedDay, allAppts]);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "reception-print-styles";
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #patient-file-print { display: block !important; }
      }
      #patient-file-print { display: none; }
    `;
    document.head.appendChild(style);
    return () => { document.getElementById("reception-print-styles")?.remove(); };
  }, []);

  async function handleCheckin(appointmentId: string) {
    setActionLoading(appointmentId);
    try {
      const res = await fetch("/api/reception/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ appointment_id: appointmentId }),
      });
      const text = await res.text();
      if (!res.ok) console.error("Checkin failed:", text);
      refreshWeek();
    } catch (e) {
      console.error("Checkin error:", e);
    } finally {
      setActionLoading(null);
    }
  }

  async function updateStatus(checkinId: string, status: CheckinStatus) {
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

      const data = await res.json();

      if (status === "done" && (data.invoice_created || data.invoice_id)) {
        window.dispatchEvent(new Event("billing:invoice-from-appointment"));
      }
      if (status === "done" && data.invoice_created) {
        setToast({ message: "✅ Appointment completed — Invoice created automatically", type: "success" });
      } else if (status === "done" && data.invoice_id) {
        setToast({ message: "✅ Appointment completed — Invoice already exists", type: "success" });
      } else if (status === "done") {
        setToast({ message: "✅ Appointment marked as done", type: "success" });
      }

      refreshWeek();
    } catch (e) {
      console.error("Status update error:", e);
      setToast({ message: "Network error", type: "error" });
    } finally {
      setActionLoading(null);
    }
  }

  async function openPatientFile(patientId: string, name: string) {
    setFileLoading(true);
    setFilePatientName(name);
    setPatientFile(null);
    const res = await fetch(`/api/reception/patient-file/${patientId}`, { credentials: "include" });
    if (res.ok) setPatientFile(await res.json());
    setFileLoading(false);
  }

  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 300);
  }

  const weekDays = getWeekDays(weekStart);

  // Get appointment counts per day for calendar dots
  function getDayAppts(day: Date) {
    return allAppts.filter(a => new Date(a.start_time).toDateString() === day.toDateString());
  }

  const filtered = filter === "all"
    ? todayQueue
    : filter === "waiting"
    ? todayQueue.filter(q => !q.checkin_id || q.checkin_status === "waiting")
    : todayQueue.filter(q => q.checkin_status === filter);

  const waitingCount = todayQueue.filter(q => q.checkin_status === "waiting").length;
  const inChairCount = todayQueue.filter(q => q.checkin_status === "in_chair").length;
  const doneCount = todayQueue.filter(q => q.checkin_status === "done").length;
  const notCheckedIn = todayQueue.filter(q => !q.checkin_id).length;

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reception</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}
              {" · "}<span className="font-mono">{time}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={refreshWeek} className="flex items-center gap-1.5 text-sm border rounded-lg px-3 py-2 hover:bg-muted">
              <RefreshCw className="size-4" /> Refresh
            </button>
            <button onClick={() => router.push(`/${locale}/scheduling`)}
              className="flex items-center gap-1.5 text-sm bg-primary text-primary-foreground rounded-lg px-3 py-2 hover:opacity-90">
              <Plus className="size-4" /> New Appointment
            </button>
          </div>
        </div>

        {/* Weekly Calendar */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="size-4 text-primary" />
              <h2 className="font-semibold text-sm">Weekly View</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}
                className="p-1.5 rounded-lg border hover:bg-muted">
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-xs font-medium text-muted-foreground px-2">
                {weekDays[0].toLocaleDateString(locale, { month: "short", day: "numeric" })} –{" "}
                {weekDays[6].toLocaleDateString(locale, { month: "short", day: "numeric" })}
              </span>
              <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}
                className="p-1.5 rounded-lg border hover:bg-muted">
                <ChevronRight className="size-4" />
              </button>
              <button onClick={() => { setWeekStart(getMonday(new Date())); setSelectedDay(new Date()); }}
                className="text-xs border rounded-lg px-2.5 py-1.5 hover:bg-muted">Today</button>
            </div>
          </div>
          <div className="grid grid-cols-7 divide-x">
            {weekDays.map(day => {
              const dayAppts = getDayAppts(day);
              const isToday = day.toDateString() === new Date().toDateString();
              const isSelected = day.toDateString() === selectedDay.toDateString();
              const providers = Array.from(new Set(dayAppts.map(a => a.provider_color)));

              return (
                <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
                  className={`p-3 text-center hover:bg-muted/50 transition-colors relative ${isSelected ? "bg-primary/5 border-b-2 border-primary" : ""}`}>
                  <p className="text-xs text-muted-foreground font-medium">
                    {day.toLocaleDateString(locale, { weekday: "short" })}
                  </p>
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center mx-auto mt-1 text-sm font-bold ${
                    isToday ? "bg-primary text-primary-foreground" :
                    isSelected ? "bg-primary/10 text-primary" : ""
                  }`}>
                    {day.getDate()}
                  </div>
                  {dayAppts.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      <p className="text-xs font-semibold text-primary">{dayAppts.length} appt{dayAppts.length > 1 ? "s" : ""}</p>
                      <div className="flex justify-center gap-0.5 flex-wrap">
                        {providers.slice(0, 4).map((color, i) => (
                          <span key={i} className="h-2 w-2 rounded-full" style={{ backgroundColor: color ?? "#6b7280" }} />
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Not Checked In", value: notCheckedIn, icon: AlertCircle, color: "text-orange-500", f: "all" as const },
            { label: "Waiting",        value: waitingCount, icon: Clock,        color: "text-yellow-500", f: "waiting" as const },
            { label: "In Chair",       value: inChairCount, icon: Stethoscope,  color: "text-blue-500",   f: "in_chair" as const },
            { label: "Done",           value: doneCount,    icon: CheckCircle,  color: "text-green-500",  f: "done" as const },
          ].map(({ label, value, icon: Icon, color, f }) => (
            <button key={label} onClick={() => setFilter(f === filter ? "all" : f)}
              className={`rounded-xl border p-4 text-start transition-colors hover:bg-muted/50 ${filter === f ? "ring-2 ring-primary border-primary" : ""}`}>
              <Icon className={`size-5 ${color} mb-2`} />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </button>
          ))}
        </div>

        {/* Patient List for selected day */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-sm">
                {selectedDay.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}
              </h2>
              <p className="text-xs text-muted-foreground">{filtered.length} appointments</p>
            </div>
          </div>

          {loading ? (
            <div className="p-5 space-y-3 animate-pulse">
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
              <div className="h-10 rounded bg-muted" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Calendar className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No appointments for this day.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(item => {
                const isCheckedIn = !!item.checkin_id;
                const status = item.checkin_status;
                const style = status ? CHECKIN_STYLES[status] : null;
                const isLoading = actionLoading !== null && (actionLoading === item.appointment_id || actionLoading === item.checkin_id);
                const apptTime = new Date(item.start_time).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
                const apptDate = new Date(item.start_time).toLocaleDateString(locale, { month: "short", day: "numeric" });
                const isToday = new Date(item.start_time).toDateString() === new Date().toDateString();
                const isLate = !isCheckedIn && isToday && new Date(item.start_time) < new Date();
                const age = item.date_of_birth
                  ? Math.floor((Date.now() - new Date(item.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                  : null;

                return (
                  <div key={item.appointment_id}
                    className={`px-5 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors ${status === "done" || status === "skipped" ? "opacity-60" : ""}`}>

                    {/* Time + date */}
                    <div className="text-center shrink-0 w-16">
                      <p className={`text-sm font-bold font-mono ${isLate ? "text-red-500" : ""}`}>{apptTime}</p>
                      {!isToday && <p className="text-[10px] text-muted-foreground">{apptDate}</p>}
                      {isLate && <p className="text-[10px] text-red-400">Late</p>}
                    </div>

                    {/* Provider color bar */}
                    <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: item.provider_color ?? "#6b7280" }} />

                    {/* Patient info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{item.first_name} {item.last_name}</p>
                        {age && <span className="text-xs text-muted-foreground">{age}y</span>}
                        {status && style && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {item.service_name || "General"} · {item.provider_name}
                        {item.duration ? ` · ${item.duration}min` : ""}
                      </p>
                      {item.phone && (
                        <a href={`tel:${item.phone}`} className="text-xs text-primary flex items-center gap-0.5 mt-0.5 hover:underline w-fit">
                          <Phone className="size-3" />{item.phone}
                        </a>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* PDF Medical File button */}
                      <button
                        onClick={() => openPatientFile(item.patient_id, `${item.first_name} ${item.last_name}`)}
                        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted text-muted-foreground"
                        title="Print medical file"
                      >
                        <FileText className="size-3.5" />
                        File
                      </button>

                      {/* Checkin actions - only for today */}
                      {isToday && (
                        !isCheckedIn ? (
                          <button onClick={() => handleCheckin(item.appointment_id)} disabled={isLoading}
                            className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50">
                            {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <UserCheck className="size-3.5" />}
                            Check In
                          </button>
                        ) : status === "waiting" ? (
                          <button onClick={() => updateStatus(item.checkin_id!, "in_chair")} disabled={isLoading}
                            className="flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                            {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Stethoscope className="size-3.5" />}
                            Call In
                          </button>
                        ) : status === "in_chair" ? (
                          <button onClick={() => updateStatus(item.checkin_id!, "done")} disabled={isLoading}
                            className="flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50">
                            {isLoading ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle className="size-3.5" />}
                            Done
                          </button>
                        ) : null
                      )}

                      <button onClick={() => router.push(`/${locale}/patients/${item.patient_id}`)}
                        className="p-1.5 rounded-lg border hover:bg-muted text-muted-foreground" title="View patient">
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Patient File Modal */}
      {(patientFile || fileLoading) && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => !fileLoading && setPatientFile(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col pointer-events-auto">
              {/* Modal header */}
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
                  <button onClick={handlePrint} disabled={printing || fileLoading}
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
                    {printing ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
                    Print / PDF
                  </button>
                  <button onClick={() => setPatientFile(null)} className="p-2 rounded-lg hover:bg-muted">
                    <X className="size-5" />
                  </button>
                </div>
              </div>

              {fileLoading ? (
                <div className="flex-1 flex items-center justify-center p-12">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              ) : patientFile && (
                <div className="flex-1 overflow-y-auto p-6 space-y-6" ref={printRef}>
                  {/* Patient Info */}
                  <section>
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Patient Information</h3>
                    <div className="grid grid-cols-3 gap-4 rounded-xl border p-4 bg-muted/20">
                      {[
                        { label: "Full Name", value: `${patientFile.patient.first_name} ${patientFile.patient.last_name}` },
                        { label: "Phone", value: patientFile.patient.phone as string },
                        { label: "Date of Birth", value: patientFile.patient.date_of_birth ? new Date(patientFile.patient.date_of_birth as string).toLocaleDateString() : "—" },
                        { label: "Gender", value: (patientFile.patient.gender as string) || "—" },
                        { label: "Email", value: (patientFile.patient.email as string) || "—" },
                        { label: "Address", value: (patientFile.patient.address as string) || "—" },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-sm font-medium mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Medical Alerts */}
                  {patientFile.medical_history && (
                    <section>
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Medical History</h3>
                      <div className="rounded-xl border p-4 space-y-3">
                        {/* Alerts */}
                        {(patientFile.medical_history.allergies as string[] ?? []).length > 0 && (
                          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                            <p className="text-xs font-semibold text-red-700">⚠️ Allergies</p>
                            <p className="text-sm text-red-700 mt-0.5">{(patientFile.medical_history.allergies as string[]).join(", ")}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: "Blood Type", value: (patientFile.medical_history.blood_type as string) || "Unknown" },
                            { label: "Diabetic", value: patientFile.medical_history.diabetic ? "Yes ⚠️" : "No" },
                            { label: "Hypertensive", value: patientFile.medical_history.hypertensive ? "Yes ⚠️" : "No" },
                            { label: "Heart Condition", value: patientFile.medical_history.heart_condition ? "Yes ⚠️" : "No" },
                            { label: "Smoker", value: patientFile.medical_history.smoking ? "Yes" : "No" },
                            { label: "Pregnant", value: patientFile.medical_history.pregnant ? "Yes ⚠️" : "No" },
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="text-sm font-medium mt-0.5">{value}</p>
                            </div>
                          ))}
                        </div>
                        {(patientFile.medical_history.medications as string[] ?? []).length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Current Medications</p>
                            <p className="text-sm">{(patientFile.medical_history.medications as string[]).join(", ")}</p>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Dental Chart summary */}
                  {patientFile.dental_chart.length > 0 && (
                    <section>
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Dental Chart</h3>
                      <div className="rounded-xl border p-4">
                        <div className="flex flex-wrap gap-1.5">
                          {patientFile.dental_chart.map(tooth => (
                            <div key={tooth.tooth_number} className="flex flex-col items-center gap-0.5">
                              <span className="text-[9px] text-muted-foreground">{tooth.tooth_number}</span>
                              <div className="h-6 w-5 rounded-sm border"
                                style={{ backgroundColor: tooth.conditions[0] ? CONDITION_COLORS[tooth.conditions[0]] ?? "#e5e7eb" : "#e5e7eb" }}
                                title={tooth.conditions.join(", ")} />
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {Object.entries(CONDITION_COLORS).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-1">
                              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: v }} />
                              <span className="text-xs text-muted-foreground capitalize">{k.replace("_", " ")}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}

                  {/* X-Rays */}
                  {patientFile.xrays.length > 0 && (
                    <section>
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">X-Rays ({patientFile.xrays.length})</h3>
                      <div className="grid grid-cols-4 gap-2">
                        {patientFile.xrays.map((xray, i) => (
                          <div key={i} className="rounded-xl overflow-hidden border bg-black">
                            <img src={xray.file_url} alt={xray.file_name} className="w-full h-20 object-cover opacity-90" />
                            <div className="px-2 py-1 bg-black/70">
                              <p className="text-white text-[9px] truncate">{xray.xray_type}{xray.tooth_number ? ` #${xray.tooth_number}` : ""}</p>
                              <p className="text-white/60 text-[9px]">{new Date(xray.taken_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Clinical Notes */}
                  {patientFile.clinical_notes.length > 0 && (
                    <section>
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">Clinical Notes</h3>
                      <div className="space-y-2">
                        {patientFile.clinical_notes.map((note, i) => (
                          <div key={i} className="rounded-xl border p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-semibold">{new Date(note.note_date).toLocaleDateString()}</p>
                              <p className="text-xs text-muted-foreground">Dr. {note.written_by_name}</p>
                            </div>
                            {note.chief_complaint && <p className="text-xs text-muted-foreground">Chief complaint: {note.chief_complaint}</p>}
                            {note.treatment_done && <p className="text-xs mt-1">Treatment: {note.treatment_done}</p>}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Visit History */}
                  <section>
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                      Visit History ({patientFile.appointments.length})
                    </h3>
                    <div className="rounded-xl border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">Date</th>
                            <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">Service</th>
                            <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">Provider</th>
                            <th className="px-3 py-2 text-start text-xs font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {patientFile.appointments.map((appt, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-3 py-2 text-xs">{new Date(appt.start_time).toLocaleDateString()}</td>
                              <td className="px-3 py-2 text-xs">{appt.service_name || "—"}</td>
                              <td className="px-3 py-2 text-xs">{appt.provider_name}</td>
                              <td className="px-3 py-2 text-xs capitalize">{appt.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Hidden print version */}
      <div id="patient-file-print" className="p-8 max-w-4xl mx-auto">
        {patientFile && (
          <>
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold">Patient Medical File</h1>
                <p className="text-gray-500">{filePatientName}</p>
              </div>
              <div className="text-right text-sm text-gray-400">
                <p>Printed: {new Date().toLocaleDateString()}</p>
                <p>Clinic OS</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h2 className="font-bold mb-2 text-sm uppercase text-gray-500">Patient Info</h2>
                <p><strong>Name:</strong> {String(patientFile.patient.first_name ?? "")} {String(patientFile.patient.last_name ?? "")}</p>
                <p><strong>Phone:</strong> {String(patientFile.patient.phone ?? "")}</p>
                <p><strong>DOB:</strong> {patientFile.patient.date_of_birth ? new Date(patientFile.patient.date_of_birth as string).toLocaleDateString() : "—"}</p>
              </div>
              {patientFile.medical_history && (
                <div>
                  <h2 className="font-bold mb-2 text-sm uppercase text-gray-500">Medical Alerts</h2>
                  {(patientFile.medical_history.allergies as string[] ?? []).length > 0 && (
                    <p className="text-red-600"><strong>⚠️ Allergies:</strong> {(patientFile.medical_history.allergies as string[]).join(", ")}</p>
                  )}
                  {!!patientFile.medical_history.diabetic && <p className="text-red-600">⚠️ Diabetic</p>}
                  {!!patientFile.medical_history.heart_condition && <p className="text-red-600">⚠️ Heart Condition</p>}
                  {!!patientFile.medical_history.hypertensive && <p className="text-red-600">⚠️ Hypertensive</p>}
                  <p><strong>Blood Type:</strong> {(patientFile.medical_history.blood_type as string) || "Unknown"}</p>
                </div>
              )}
            </div>

            {patientFile.clinical_notes.length > 0 && (
              <div className="mb-6">
                <h2 className="font-bold mb-2 text-sm uppercase text-gray-500 border-b pb-1">Clinical Notes</h2>
                {patientFile.clinical_notes.map((note, i) => (
                  <div key={i} className="mb-3 pb-3 border-b">
                    <p className="text-sm font-semibold">{new Date(note.note_date).toLocaleDateString()} — Dr. {note.written_by_name}</p>
                    {note.chief_complaint && <p className="text-sm">Complaint: {note.chief_complaint}</p>}
                    {note.treatment_done && <p className="text-sm">Treatment: {note.treatment_done}</p>}
                  </div>
                ))}
              </div>
            )}

            <div>
              <h2 className="font-bold mb-2 text-sm uppercase text-gray-500 border-b pb-1">Visit History</h2>
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
                      <td className="py-1 pr-4">{new Date(appt.start_time).toLocaleDateString()}</td>
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

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-2xl text-sm font-medium transition-all animate-in slide-in-from-bottom-4 ${
          toast.type === "success"
            ? "bg-green-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      )}
    </>
  );
}