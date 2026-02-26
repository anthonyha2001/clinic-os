"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

type TabId = "overview" | "notes" | "appointments" | "plans" | "billing";

interface PatientTabsProps {
  patientId: string;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function PatientTabs({ patientId, activeTab, onTabChange }: PatientTabsProps) {
  const t = useTranslations("patients.tabs");
  const tPatients = useTranslations("patients");
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? "en";

  const [loadedTabs, setLoadedTabs] = useState<Set<TabId>>(new Set([activeTab]));

  const handleTabClick = (tab: TabId) => {
    setLoadedTabs((prev) => new Set([...Array.from(prev), tab]));
    onTabChange(tab);
  };

  const tabs: TabId[] = ["overview", "notes", "appointments", "plans", "billing"];

  return (
    <div className="mt-6">
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-4" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => handleTabClick(tab)}
              className={`border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground"
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-4">
        {loadedTabs.has("overview") && activeTab === "overview" && (
          <div className="text-sm text-muted-foreground">
            {tPatients("patientSummary")}
          </div>
        )}

        {loadedTabs.has("notes") && activeTab === "notes" && (
          <NotesTab patientId={patientId} locale={locale} />
        )}

        {loadedTabs.has("appointments") && activeTab === "appointments" && (
          <AppointmentsTab patientId={patientId} router={router} locale={locale} />
        )}

        {loadedTabs.has("plans") && activeTab === "plans" && (
          <PlansTab patientId={patientId} router={router} locale={locale} />
        )}

        {loadedTabs.has("billing") && activeTab === "billing" && (
          <BillingTab patientId={patientId} router={router} locale={locale} />
        )}
      </div>
    </div>
  );
}

function NotesTab({
  patientId,
  locale,
}: {
  patientId: string;
  locale: string;
}) {
  const t = useTranslations("patients");
  const tCommon = useTranslations("common");
  const [notes, setNotes] = useState<{
    id: string;
    content: string;
    isPinned: boolean;
    createdAt: string;
    authorId: string;
    authorName: string;
  }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notesRes, meRes] = await Promise.all([
        fetch(`/api/patients/${patientId}/notes`, { credentials: "include" }),
        fetch("/api/auth/me", { credentials: "include" }),
      ]);
      if (!notesRes.ok) throw new Error("Failed to load notes");
      const notesData = await notesRes.json();
      setNotes(notesData);

      if (meRes.ok) {
        const me = await meRes.json();
        setCurrentUserId(me?.id ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading notes");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSubmitNote = async () => {
    const content = newNote.trim();
    if (!content) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add note");
      const created = await res.json();
      setNotes((prev) => (prev ? [created, ...prev] : [created]));
      setNewNote("");
    } catch {
      setError("Failed to add note");
    } finally {
      setSubmitting(false);
    }
  };

  const togglePin = async (noteId: string, isPinned: boolean) => {
    const res = await fetch(`/api/patients/${patientId}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_pinned: !isPinned }),
      credentials: "include",
    });
    if (res.ok) fetchNotes();
  };

  const deleteNote = async (noteId: string) => {
    const res = await fetch(`/api/patients/${patientId}/notes/${noteId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) setNotes((prev) => (prev ?? []).filter((n) => n.id !== noteId));
  };

  if (loading && notes === null) {
    return <div className="py-8 text-center text-muted-foreground">{tCommon("loading")}</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder={t("notePlaceholder")}
          className="w-full rounded-lg border border-border p-3 text-sm"
          rows={3}
        />
        <button
          type="button"
          onClick={handleSubmitNote}
          disabled={submitting || !newNote.trim()}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {t("addNote")}
        </button>
      </div>

      <div className="space-y-2">
        {notes?.length === 0 && (
          <p className="py-4 text-center text-muted-foreground">{t("noNotes")}</p>
        )}
        {notes?.map((note) => (
          <div
            key={note.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {note.isPinned ? (
                  <button
                    type="button"
                    onClick={() => togglePin(note.id, note.isPinned)}
                    className="text-primary"
                    title="Unpin"
                  >
                    📌
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => togglePin(note.id, note.isPinned)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Pin"
                  >
                    ○
                  </button>
                )}
                <span className="text-xs text-muted-foreground">
                  {note.authorName} • {new Date(note.createdAt).toLocaleString(locale)}
                </span>
              </div>
              {currentUserId === note.authorId && (
                <button
                  type="button"
                  onClick={() => deleteNote(note.id)}
                  className="text-muted-foreground hover:text-red-600"
                  aria-label="Delete"
                >
                  ×
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm">{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppointmentsTab({
  patientId,
  router,
  locale,
}: {
  patientId: string;
  router: { push: (href: string) => void };
  locale: string;
}) {
  const t = useTranslations("patients");
  const tCommon = useTranslations("common");
  const [appointments, setAppointments] = useState<
    {
      id: string;
      startTime: string;
      status: string;
      providerName: string;
      services: { name: string }[];
    }[]
  | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    completed: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
    canceled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    no_show: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  };

  useEffect(() => {
    fetch(`/api/patients/${patientId}/appointments`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((data) => {
        setAppointments(data);
      })
      .catch(() => setError("Failed to load appointments"))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading && appointments === null) {
    return <div className="py-8 text-center text-muted-foreground">{tCommon("loading")}</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  const getStatusLabel = (s: string) => {
    if (s === "no_show") return t("noShow");
    return t(s as "scheduled" | "completed" | "canceled" | "confirmed") ?? s;
  };

  return (
    <div className="overflow-x-auto">
      {appointments?.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">{t("noAppointments")}</p>
      )}
      {appointments && appointments.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 text-start font-medium">Date</th>
              <th className="py-2 text-start font-medium">{t("provider")}</th>
              <th className="py-2 text-start font-medium">Service</th>
              <th className="py-2 text-start font-medium">{t("status")}</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <tr
                key={a.id}
                onClick={() => router.push(`/scheduling/${a.id}`)}
                className="cursor-pointer border-b border-border hover:bg-muted/50"
              >
                <td className="py-3">
                  {new Date(a.startTime).toLocaleString(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </td>
                <td>{a.providerName}</td>
                <td>{a.services?.map((s) => s.name).join(", ") || "—"}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      statusColors[a.status] ?? "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {getStatusLabel(a.status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PlansTab({
  patientId,
  router,
  locale,
}: {
  patientId: string;
  router: { push: (href: string) => void };
  locale: string;
}) {
  const t = useTranslations("patients.tabs");
  const [plans, setPlans] = useState<
    {
      id: string;
      name_en: string;
      name_fr: string;
      name_ar: string;
      status: string;
      item_count: number;
      quantity_completed_sum: number;
    }[]
  | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/plans?patient_id=${patientId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((data) => {
        setPlans(Array.isArray(data) ? data : (data?.plans ?? []));
      })
      .catch(() => setError("Failed to load plans"))
      .finally(() => setLoading(false));
  }, [patientId]);

  const getPlanName = (p: { name_en: string; name_fr: string; name_ar: string }) => {
    if (locale === "fr") return p.name_fr;
    if (locale === "ar") return p.name_ar;
    return p.name_en;
  };

  if (loading && plans === null) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/patients/${patientId}/plans/new`}
          className="inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          New Plan
        </Link>
      </div>
      {plans?.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No plans yet</p>
      )}
      <div className="space-y-2">
        {plans?.map((p) => {
          const total = p.total_sessions ?? p.item_count ?? 0;
          const completed = p.completed_sessions ?? p.quantity_completed_sum ?? 0;
          const progress = total > 0 ? `${completed} / ${total}` : "—";
          return (
            <div
              key={p.id}
              onClick={() => router.push(`/patients/${patientId}/plans/${p.id}`)}
              className="cursor-pointer rounded-lg border border-border p-4 hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{getPlanName(p)}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize dark:bg-gray-700">
                  {p.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {(p.item_count ?? 0)} items • Progress: {progress}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BillingTab({
  patientId,
  router,
  locale,
}: {
  patientId: string;
  router: { push: (href: string) => void };
  locale: string;
}) {
  const [invoices, setInvoices] = useState<
    {
      id: string;
      invoice_number: string;
      created_at: string;
      total: string;
      balance_due: string;
      status: string;
    }[]
  | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/invoices?patient_id=${patientId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((data) => {
        setInvoices(Array.isArray(data) ? data : []);
      })
      .catch(() => setError("Failed to load invoices"))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading && invoices === null) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  return (
    <div className="overflow-x-auto">
      {invoices?.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No invoices yet</p>
      )}
      {invoices && invoices.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 text-start font-medium">Invoice #</th>
              <th className="py-2 text-start font-medium">Date</th>
              <th className="py-2 text-end font-medium">Total</th>
              <th className="py-2 text-end font-medium">Balance due</th>
              <th className="py-2 text-start font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr
                key={inv.id}
                onClick={() => router.push(`/billing/${inv.id}`)}
                className="cursor-pointer border-b border-border hover:bg-muted/50"
              >
                <td className="py-3">{inv.invoice_number ?? inv.id.slice(0, 8)}</td>
                <td>{new Date(inv.created_at).toLocaleDateString(locale)}</td>
                <td className="text-end">{Number(inv.total).toFixed(2)}</td>
                <td className="text-end">{Number(inv.balance_due ?? 0).toFixed(2)}</td>
                <td>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize dark:bg-gray-700">
                    {inv.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
