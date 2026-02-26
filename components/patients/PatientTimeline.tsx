"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Receipt,
  CreditCard,
  FileText,
  ClipboardList,
  User,
} from "lucide-react";

type TimelineEvent = {
  id: string;
  type: "appointment" | "invoice" | "payment" | "note" | "plan" | "patient";
  title: string;
  subtitle?: string;
  status?: string;
  amount?: number;
  date: string;
  link?: string;
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  appointment: Calendar,
  invoice: Receipt,
  payment: CreditCard,
  note: FileText,
  plan: ClipboardList,
  patient: User,
};

const TYPE_COLORS: Record<string, string> = {
  appointment: "bg-blue-100 text-blue-700",
  invoice: "bg-yellow-100 text-yellow-700",
  payment: "bg-green-100 text-green-700",
  note: "bg-gray-100 text-gray-600",
  plan: "bg-purple-100 text-purple-700",
  patient: "bg-primary/10 text-primary",
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
  proposed: "bg-blue-100 text-blue-700",
  accepted: "bg-teal-100 text-teal-700",
  in_progress: "bg-purple-100 text-purple-700",
};

export function PatientTimeline({
  patientId,
  locale,
}: {
  patientId: string;
  locale: string;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const opts = { cache: "no-store" as RequestCache, credentials: "include" as RequestCredentials };

  const buildTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const [apptRes, invoiceRes, noteRes, planRes] = await Promise.all([
        fetch(`/api/patients/${patientId}/appointments`, opts),
        fetch(`/api/invoices?patient_id=${patientId}`, opts),
        fetch(`/api/patients/${patientId}/notes`, opts),
        fetch(`/api/plans?patient_id=${patientId}`, opts),
      ]);

      const [apptData, invoiceData, noteData, planData] = await Promise.all([
        apptRes.json(),
        invoiceRes.json(),
        noteRes.json(),
        planRes.json(),
      ]);

      const timeline: TimelineEvent[] = [];

      const apptList = Array.isArray(apptData) ? apptData : (apptData?.appointments ?? []);
      for (const appt of apptList) {
        const services = appt.services as { name: string }[] | undefined;
        const serviceName = services?.[0]?.name ?? (appt.service as Record<string, string>)?.name_en ?? "Appointment";
        const dateStr = appt.start_time ?? appt.startTime;
        if (!dateStr) continue;
        timeline.push({
          id: `appt-${appt.id}`,
          type: "appointment",
          title: serviceName,
          subtitle: appt.providerName ?? (appt.provider as Record<string, unknown>)?.user?.full_name,
          status: appt.status,
          date: dateStr,
          link: `/${locale}/scheduling`,
        });
      }

      const invList = Array.isArray(invoiceData) ? invoiceData : (invoiceData?.invoices ?? []);
      for (const inv of invList) {
        timeline.push({
          id: `inv-${inv.id}`,
          type: "invoice",
          title: `Invoice ${inv.invoice_number ?? inv.id}`,
          subtitle: `$${Number(inv.total ?? 0).toFixed(2)}`,
          status: inv.status,
          amount: Number(inv.total ?? 0),
          date: inv.created_at,
          link: `/${locale}/billing/${inv.id}`,
        });
      }

      const noteList = Array.isArray(noteData) ? noteData : (noteData?.notes ?? []);
      for (const note of noteList) {
        const content = (note.content as string) ?? "";
        timeline.push({
          id: `note-${note.id}`,
          type: "note",
          title: "Clinical Note",
          subtitle: content.slice(0, 80) + (content.length > 80 ? "..." : ""),
          date: note.created_at ?? note.createdAt,
        });
      }

      const planList = Array.isArray(planData) ? planData : (planData?.plans ?? []);
      for (const plan of planList) {
        timeline.push({
          id: `plan-${plan.id}`,
          type: "plan",
          title: (plan.name_en as string) ?? "Plan",
          subtitle: `${plan.item_count ?? 0} items`,
          status: plan.status,
          date: plan.proposed_at ?? plan.created_at,
          link: `/${locale}/plans/${plan.id}`,
        });
      }

      timeline.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setEvents(timeline);
    } finally {
      setLoading(false);
    }
  }, [patientId, locale]);

  useEffect(() => {
    buildTimeline();
  }, [buildTimeline]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") buildTimeline();
    };
    const onFocus = () => buildTimeline();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [buildTimeline]);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-12 text-sm">
        No activity yet.
      </p>
    );
  }

  const grouped = events.reduce<Record<string, TimelineEvent[]>>(
    (acc, event) => {
      const key = new Date(event.date).toLocaleDateString(locale, {
        month: "long",
        year: "numeric",
      });
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([month, monthEvents]) => (
        <div key={month}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {month}
          </p>
          <div className="relative">
            <div className="absolute start-5 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-2">
              {monthEvents.map((event) => (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 ps-12 relative ${event.link ? "cursor-pointer" : ""}`}
                  onClick={() => event.link && router.push(event.link)}
                >
                  <div
                    className={`absolute start-2.5 h-5 w-5 rounded-full flex items-center justify-center text-xs ${TYPE_COLORS[event.type] ?? ""}`}
                  >
                    {(function IconWrap() {
                      const Icon = TYPE_ICONS[event.type] ?? FileText;
                      return <Icon className="size-3" />;
                    })()}
                  </div>

                  <div
                    className={`flex-1 rounded-xl border bg-card p-3 ${event.link ? "hover:bg-muted/50 transition-colors" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-medium leading-tight">
                          {event.title}
                        </p>
                        {event.subtitle && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {event.subtitle}
                          </p>
                        )}
                      </div>
                      <div className="text-end shrink-0 space-y-1">
                        {event.status && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[event.status] ?? "bg-gray-100"}`}
                          >
                            {event.status.replace("_", " ")}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {new Date(event.date).toLocaleDateString(locale, {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
