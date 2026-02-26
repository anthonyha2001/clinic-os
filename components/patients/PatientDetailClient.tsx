"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageCircle,
  Pencil,
  Cake,
  Users,
  MapPin,
  Phone,
  Calendar,
  ArrowRight,
  Pin,
  X,
} from "lucide-react";
import { PatientEditDrawer } from "./PatientEditDrawer";
import { PatientTimeline } from "./PatientTimeline";
import { PatientTags } from "./PatientTags";
import { AppointmentFormDrawer } from "@/components/scheduling/AppointmentFormDrawer";
import { NewInvoiceClient } from "@/components/billing/NewInvoiceClient";
import { ToothChart, type ToothData } from "@/components/dental/ToothChart";
import { ToothEditModal } from "@/components/dental/ToothEditModal";
import { MedicalHistoryForm } from "@/components/dental/MedicalHistoryForm";
import { XrayUploader } from "@/components/dental/XrayUploader";

const TABS = [
  "overview",
  "timeline",
  "appointments",
  "plans",
  "billing",
  "notes",
  "dental",
  "medical",
  "xrays",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  timeline: "Timeline",
  appointments: "Appointments",
  plans: "Plans",
  billing: "Billing",
  notes: "Notes",
  dental: "🦷 Dental Chart",
  medical: "Medical History",
  xrays: "X-Rays",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600",
  canceled: "bg-red-100 text-red-700",
  no_show: "bg-orange-100 text-orange-700",
  draft: "bg-gray-100 text-gray-600",
  issued: "bg-yellow-100 text-yellow-700",
  partially_paid: "bg-orange-100 text-orange-700",
  paid: "bg-green-100 text-green-700",
  voided: "bg-red-100 text-red-700",
  proposed: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-700",
  in_progress: "bg-purple-100 text-purple-700",
};

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  phone_secondary?: string;
  email?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  preferred_locale?: string;
  is_active?: boolean;
  tags?: { id: string; name_en: string; color_hex?: string }[];
  created_at: string;
};

type Stats = {
  total_spent: number;
  total_appointments: number;
  last_visit?: string;
  completed_appointments: number;
  active_plans: number;
  unpaid_balance: number;
};

function normalizePatientFromApi(raw: Record<string, unknown> | null): Patient | null {
  if (!raw) return null;
  return {
    id: raw.id as string,
    first_name: (raw.first_name ?? raw.firstName) as string,
    last_name: (raw.last_name ?? raw.lastName) as string,
    phone: (raw.phone as string) ?? "",
    phone_secondary: (raw.phone_secondary ?? raw.phoneSecondary) as string | undefined,
    email: (raw.email as string) | undefined,
    date_of_birth: (raw.date_of_birth ?? raw.dateOfBirth) as string | undefined,
    gender: (raw.gender as string) | undefined,
    address: (raw.address as string) | undefined,
    preferred_locale: (raw.preferred_locale ?? raw.preferredLocale) as string | undefined,
    is_active: raw.is_active ?? raw.isActive ?? true,
    tags: (raw.tags as { id: string; name_en: string; color_hex?: string }[]) ?? [],
    created_at: (raw.created_at ?? raw.createdAt) as string,
  };
}

export function PatientDetailClient({
  patientId,
  locale,
}: {
  patientId: string;
  locale: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const [notes, setNotes] = useState<Record<string, unknown>[]>([]);
  const [appointments, setAppointments] = useState<Record<string, unknown>[]>([]);
  const [plans, setPlans] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [tabLoaded, setTabLoaded] = useState<Record<Tab, boolean>>({
    overview: false,
    timeline: false,
    appointments: false,
    plans: false,
    billing: false,
    notes: false,
    dental: false,
    medical: false,
    xrays: false,
  });
  const [providers, setProviders] = useState<Record<string, unknown>[]>([]);

  const [teeth, setTeeth] = useState<ToothData[]>([]);
  const [editingTooth, setEditingTooth] = useState<{
    number: number;
    current: ToothData | null;
  } | null>(null);

  async function fetchPatient() {
    const res = await fetch(`/api/patients/${patientId}`);
    const data = await res.json();
    const raw = data.patient ?? data;
    setPatient(normalizePatientFromApi(raw ?? null));
  }

  async function fetchStats() {
    const res = await fetch(`/api/patients/${patientId}/stats`);
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats ?? data);
    }
  }

  useEffect(() => {
    Promise.all([fetchPatient(), fetchStats()]).finally(() => setLoading(false));
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers ?? d ?? []));
  }, [patientId]);

  useEffect(() => {
    if (tabLoaded[activeTab]) return;
    setTabLoaded((t) => ({ ...t, [activeTab]: true }));

    if (activeTab === "notes") {
      fetch(`/api/patients/${patientId}/notes`)
        .then((r) => r.json())
        .then((d) => {
          const list = d.notes ?? d ?? [];
          setNotes(
            Array.isArray(list)
              ? list.map((n: Record<string, unknown>) => ({
                  ...n,
                  id: n.id,
                  content: n.content,
                  is_pinned: n.is_pinned ?? n.isPinned,
                  created_at: (n.created_at ?? n.createdAt) as string,
                  author: n.author ?? (n.authorName ? { full_name: n.authorName } : undefined),
                }))
              : []
          );
        });
    }
    if (activeTab === "appointments") {
      fetch(`/api/patients/${patientId}/appointments`)
        .then((r) => r.json())
        .then((d) => {
          const list = d.appointments ?? d ?? [];
          setAppointments(
            Array.isArray(list)
              ? list.map((a: Record<string, unknown>) => ({
                  id: a.id,
                  start_time: a.start_time ?? a.startTime,
                  end_time: a.end_time ?? a.endTime,
                  status: a.status,
                  provider: {
                    user: { full_name: a.providerName ?? (a.provider as Record<string, unknown>)?.user?.full_name },
                  },
                  service: {
                    name_en:
                      (a.services as { name: string }[])?.[0]?.name ?? (a.service as Record<string, string>)?.name_en,
                  },
                }))
              : []
          );
        });
    }
    if (activeTab === "plans") {
      fetch(`/api/plans?patient_id=${patientId}`)
        .then((r) => r.json())
        .then((d) => setPlans(d.plans ?? d ?? []));
    }
    if (activeTab === "billing") {
      fetch(`/api/invoices?patient_id=${patientId}`)
        .then((r) => r.json())
        .then((d) => setInvoices(d.invoices ?? d ?? []));
    }
  }, [activeTab, patientId, tabLoaded]);

  useEffect(() => {
    if (activeTab !== "dental") return;
    fetch(`/api/dental/chart/${patientId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d) ? d : d.teeth ?? [];
        setTeeth(
          rows.map((r: Record<string, unknown>) => ({
            tooth_number: Number(r.tooth_number),
            conditions: Array.isArray(r.conditions)
              ? r.conditions
              : typeof r.conditions === "string"
                ? JSON.parse(r.conditions || "[]")
                : [],
            notes: r.notes as string | undefined,
          }))
        );
      });
  }, [activeTab, patientId]);

  async function saveTooth(
    toothNumber: number,
    conditions: string[],
    notes: string
  ) {
    const res = await fetch(`/api/dental/chart/${patientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        tooth_number: toothNumber,
        conditions,
        notes,
      }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Record<string, unknown>;
      const normalized: ToothData = {
        tooth_number: Number(updated.tooth_number ?? toothNumber),
        conditions: Array.isArray(updated.conditions)
          ? updated.conditions
          : typeof updated.conditions === "string"
            ? JSON.parse(updated.conditions || "[]")
            : [],
        notes: updated.notes as string | undefined,
      };
      setTeeth((prev) => {
        const idx = prev.findIndex((t) => t.tooth_number === toothNumber);
        if (idx >= 0)
          return prev.map((t, i) => (i === idx ? normalized : t));
        return [...prev, normalized];
      });
    }
  }

  async function addNote() {
    if (!newNote.trim()) return;
    setSavingNote(true);
    const res = await fetch(`/api/patients/${patientId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newNote }),
    });
    const data = await res.json();
    const note = data.note ?? data;
    const normalized = {
      ...note,
      id: note.id,
      content: note.content,
      is_pinned: note.is_pinned ?? note.isPinned,
      created_at: note.created_at ?? note.createdAt,
      author: note.author ?? (note.authorName ? { full_name: note.authorName } : undefined),
    };
    setNotes((n) => [normalized, ...n]);
    setNewNote("");
    setSavingNote(false);
  }

  async function toggleActive() {
    if (!patient) return;
    setTogglingActive(true);
    await fetch(`/api/patients/${patientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !patient.is_active }),
    });
    await fetchPatient();
    setTogglingActive(false);
  }

  function openWhatsApp() {
    if (!patient?.phone) return;
    const cleaned = patient.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${cleaned}`, "_blank");
  }

  function getAge(dob: string) {
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-40 bg-muted rounded-xl" />
        <div className="h-12 bg-muted rounded-xl" />
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Patient not found.
      </div>
    );
  }

  const initials = `${patient.first_name[0] ?? ""}${patient.last_name[0] ?? ""}`.toUpperCase();

  return (
    <div className="space-y-4 max-w-5xl">
      <button
        onClick={() => router.push(`/${locale}/patients`)}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ArrowLeft className="size-4 inline-block" />
        Back to Patients
      </button>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">
                  {patient.first_name} {patient.last_name}
                </h1>
                {!patient.is_active && (
                  <span className="rounded-full bg-red-100 text-red-600 text-xs px-2 py-0.5 font-medium">
                    Inactive
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{patient.phone}</p>
              {patient.email && (
                <p className="text-xs text-muted-foreground">{patient.email}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={openWhatsApp}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 flex items-center gap-1.5"
            >
              <MessageCircle className="size-4 inline-block" />
              WhatsApp
            </button>
            <button
              onClick={() => setShowBooking(true)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              + Book Appointment
            </button>
            <button
              onClick={() => setShowNewInvoice(true)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              + New Invoice
            </button>
            <button
              onClick={() => setShowEditDrawer(true)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted flex items-center gap-1.5"
            >
              <Pencil className="size-3.5 inline-block" />
              Edit
            </button>
            <button
              onClick={toggleActive}
              disabled={togglingActive}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                patient.is_active
                  ? "border-red-200 text-red-600 hover:bg-red-50"
                  : "border-green-200 text-green-600 hover:bg-green-50"
              }`}
            >
              {togglingActive ? "..." : patient.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mt-5 pt-4 border-t">
            {[
              {
                label: "Total Spent",
                value: `$${Number(stats.total_spent ?? 0).toLocaleString()}`,
                color: "text-green-600",
              },
              {
                label: "Appointments",
                value: stats.total_appointments ?? 0,
                color: "text-blue-600",
              },
              {
                label: "Completed",
                value: stats.completed_appointments ?? 0,
                color: "text-gray-600",
              },
              {
                label: "Active Plans",
                value: stats.active_plans ?? 0,
                color: "text-purple-600",
              },
              {
                label: "Unpaid Balance",
                value: `$${Number(stats.unpaid_balance ?? 0).toFixed(0)}`,
                color:
                  Number(stats.unpaid_balance) > 0 ? "text-orange-600" : "text-gray-400",
              },
              {
                label: "Last Visit",
                value: stats.last_visit
                  ? new Date(stats.last_visit).toLocaleDateString(locale, {
                      month: "short",
                      day: "numeric",
                    })
                  : "Never",
                color: "text-muted-foreground",
              },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-4 mt-4 flex-wrap text-xs text-muted-foreground">
          {patient.date_of_birth && (
            <span>
              <Cake className="size-4 inline-block" />
              {new Date(patient.date_of_birth).toLocaleDateString(locale)} (
              {getAge(patient.date_of_birth)}y)
            </span>
          )}
          {patient.gender && (
            <span className="flex items-center gap-1">
              <Users className="size-4 inline-block" />
              {patient.gender}
            </span>
          )}
          {patient.address && (
            <span className="flex items-center gap-1">
              <MapPin className="size-4 inline-block" />
              {patient.address}
            </span>
          )}
          {patient.phone_secondary && (
            <span className="flex items-center gap-1">
              <Phone className="size-4 inline-block" />
              {patient.phone_secondary}
            </span>
          )}
          <span>
            <span className="flex items-center gap-1">
              <Calendar className="size-4 inline-block" />
              Patient since{" "}
            </span>
            {new Date(patient.created_at).toLocaleDateString(locale, {
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>

        <div className="mt-3">
          <PatientTags
            patientId={patientId}
            tags={patient.tags ?? []}
            onTagsChange={(tags) =>
              setPatient((p) => (p ? { ...p, tags } : p))
            }
          />
        </div>
      </div>

      <div className="border-b flex gap-0.5 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">Personal Information</h3>
              <div className="space-y-2 text-sm">
                {[
                  {
                    label: "Full Name",
                    value: `${patient.first_name} ${patient.last_name}`,
                  },
                  { label: "Phone", value: patient.phone },
                  { label: "Secondary Phone", value: patient.phone_secondary },
                  { label: "Email", value: patient.email },
                  {
                    label: "Date of Birth",
                    value: patient.date_of_birth
                      ? new Date(patient.date_of_birth).toLocaleDateString(locale)
                      : undefined,
                  },
                  { label: "Gender", value: patient.gender },
                  { label: "Address", value: patient.address },
                  {
                    label: "Preferred Language",
                    value: patient.preferred_locale?.toUpperCase(),
                  },
                  {
                    label: "Status",
                    value: patient.is_active ? "Active" : "Inactive",
                  },
                ]
                  .filter((f) => f.value)
                  .map((field) => (
                    <div
                      key={field.label}
                      className="flex justify-between gap-4"
                    >
                      <span className="text-muted-foreground shrink-0">
                        {field.label}
                      </span>
                      <span className="font-medium text-end">{field.value}</span>
                    </div>
                  ))}
              </div>
              <button
                onClick={() => setShowEditDrawer(true)}
                className="text-xs text-primary hover:underline"
              >
                Edit information
                <ArrowRight className="size-4 inline-block ms-0.5" />
              </button>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Recent Appointments</h3>
                <button
                  onClick={() => setActiveTab("appointments")}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                  <ArrowRight className="size-4 inline-block ms-0.5" />
                </button>
              </div>
              {stats?.total_appointments === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No appointments yet.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Switch to the Appointments tab to view details.
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === "timeline" && (
          <PatientTimeline patientId={patientId} locale={locale} />
        )}

        {activeTab === "notes" && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a clinical note..."
                rows={3}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-background resize-none"
              />
              <button
                onClick={addNote}
                disabled={!newNote.trim() || savingNote}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {savingNote ? "Saving..." : "Add Note"}
              </button>
            </div>
            {notes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No notes yet.
              </p>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id as string}
                  className="rounded-xl border bg-card p-4 space-y-1"
                >
                  {note.is_pinned && (
                    <span className="text-xs text-primary font-medium">
                      <Pin className="size-4 inline-block" />
                      Pinned
                    </span>
                  )}
                  <p className="text-sm">{note.content as string}</p>
                  <p className="text-xs text-muted-foreground">
                    {(note.author as Record<string, string> | undefined)?.full_name ??
                      "—"}{" "}
                    ·{" "}
                    {new Date(note.created_at as string).toLocaleDateString(
                      locale
                    )}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "appointments" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => setShowBooking(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                + Book Appointment
              </button>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              {appointments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No appointments yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                        Date & Time
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                        Provider
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                        Service
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {appointments.map((appt) => {
                      const provider = appt.provider as
                        | Record<string, unknown>
                        | undefined;
                      const service = appt.service as
                        | Record<string, string>
                        | undefined;
                      const start = (appt.start_time ?? appt.startTime) as string;
                      return (
                        <tr
                          key={appt.id as string}
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium">
                              {new Date(start).toLocaleDateString(locale, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(start).toLocaleTimeString(locale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {(provider?.user as Record<string, string> | undefined)
                              ?.full_name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {service?.name_en ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status as string] ?? ""}`}
                            >
                              {(appt.status as string)?.replace("_", " ")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === "plans" && (
          <div className="space-y-3">
            {plans.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No treatment plans yet.
              </p>
            ) : (
              plans.map((plan) => (
                <div
                  key={plan.id as string}
                  onClick={() =>
                    router.push(`/${locale}/plans/${plan.id}`)
                  }
                  className="rounded-xl border bg-card p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">
                      {plan.name_en as string}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[plan.status as string] ?? "bg-gray-100"}`}
                    >
                      {(plan.status as string)?.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {Number(plan.item_count ?? 0)} items ·{" "}
                    {Number(plan.completed_sessions ?? 0)}/
                    {Number(plan.total_sessions ?? 0)} sessions
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "dental" && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold mb-4">Dental Chart</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Click any tooth to update its condition.
              </p>
              <ToothChart
                teeth={teeth}
                onToothClick={(num, current) =>
                  setEditingTooth({ number: num, current })
                }
              />
            </div>
            {editingTooth && (
              <ToothEditModal
                toothNumber={editingTooth.number}
                current={editingTooth.current}
                onSave={(conditions, notes) =>
                  saveTooth(editingTooth.number, conditions, notes)
                }
                onClose={() => setEditingTooth(null)}
              />
            )}
          </div>
        )}

        {activeTab === "medical" && (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold mb-4">Medical History</h2>
            <MedicalHistoryForm patientId={patientId} />
          </div>
        )}

        {activeTab === "xrays" && (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold mb-4">X-Rays</h2>
            <XrayUploader patientId={patientId} />
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => setShowNewInvoice(true)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                + New Invoice
              </button>
            </div>
            <div className="rounded-xl border bg-card overflow-hidden">
              {invoices.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  No invoices yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                        Invoice #
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                        Total
                      </th>
                      <th className="px-4 py-3 text-end font-medium text-muted-foreground">
                        Balance
                      </th>
                      <th className="px-4 py-3 text-start font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id as string}
                        onClick={() =>
                          router.push(`/${locale}/billing/${inv.id}`)
                        }
                        className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-medium">
                          {inv.invoice_number as string}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(
                            inv.created_at as string
                          ).toLocaleDateString(locale)}
                        </td>
                        <td className="px-4 py-3 text-end">
                          ${Number(inv.total ?? 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-end font-medium">
                          $
                          {Number(
                            inv.balance_due ?? inv.balanceDue ?? inv.total ?? 0
                          ).toFixed(2)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status as string] ?? ""}`}
                          >
                            {(inv.status as string)?.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {showEditDrawer && patient && (
        <PatientEditDrawer
          patient={patient}
          onClose={() => setShowEditDrawer(false)}
          onSuccess={(updated) => {
            setPatient(normalizePatientFromApi(updated as unknown as Record<string, unknown>));
            setShowEditDrawer(false);
          }}
        />
      )}

      {showBooking && (
        <AppointmentFormDrawer
          initialPatientId={patientId}
          initialPatientName={`${patient.first_name} ${patient.last_name}`}
          providers={providers}
          onClose={() => setShowBooking(false)}
          onSuccess={() => {
            setShowBooking(false);
            setTabLoaded((t) => ({ ...t, appointments: false }));
            setActiveTab("appointments");
          }}
        />
      )}

      {showNewInvoice && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">New Invoice</h2>
              <button
                onClick={() => setShowNewInvoice(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6">
              <NewInvoiceClient
                locale={locale}
                prefillPatientId={patientId}
                prefillPatientName={`${patient.first_name} ${patient.last_name}`}
                onSuccess={() => {
                  setShowNewInvoice(false);
                  setTabLoaded((t) => ({ ...t, billing: false }));
                  setActiveTab("billing");
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
