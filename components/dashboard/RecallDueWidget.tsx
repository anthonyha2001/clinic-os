"use client";

import { useEffect, useState, useCallback } from "react";
import { CalendarClock, Send, RefreshCw, CheckCircle } from "lucide-react";

type RecallEntry = {
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  service_id: string;
  service_name: string;
  recall_interval_days: number;
  last_visit: string;
  due_date: string;
  days_overdue: number;
};

type Summary = {
  total_overdue: number;
  total_upcoming: number;
  limit_days: number;
};

export function RecallDueWidget({ locale }: { locale: string }) {
  const [overdue, setOverdue] = useState<RecallEntry[]>([]);
  const [upcoming, setUpcoming] = useState<RecallEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overdue" | "upcoming">("overdue");
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/recall-due?limit_days=30", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setOverdue(data.overdue ?? []);
        setUpcoming(data.upcoming ?? []);
        setSummary(data.summary ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function sendWhatsApp(entry: RecallEntry) {
    const key = `${entry.patient_id}-${entry.service_id}`;
    setSending(key);
    try {
      const message = `Hello ${entry.patient_name.split(" ")[0]}, your dental clinic recommends your routine *${entry.service_name}*. It's been a while since your last visit — would you like to schedule an appointment? Reply or call us to book.`;
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to: entry.patient_phone,
          message,
          patient_id: entry.patient_id,
          type: "recall_reminder",
        }),
      });
      setToast(res.ok ? `✅ Reminder sent to ${entry.patient_name}` : "❌ Failed to send");
    } catch {
      setToast("❌ Network error");
    } finally {
      setSending(null);
    }
  }

  function formatDue(entry: RecallEntry) {
    if (entry.days_overdue > 0) {
      return (
        <span className="text-red-600 font-medium text-xs">
          {entry.days_overdue}d overdue
        </span>
      );
    }
    const daysLeft = Math.abs(entry.days_overdue);
    if (daysLeft === 0) return <span className="text-amber-600 text-xs font-medium">Due today</span>;
    return <span className="text-amber-600 text-xs">In {daysLeft} days</span>;
  }

  const list = tab === "overdue" ? overdue : upcoming;

  return (
    <div className="app-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
            <CalendarClock className="size-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Recall Due</h2>
            {summary && (
              <p className="text-xs text-muted-foreground">
                {summary.total_overdue} overdue · {summary.total_upcoming} upcoming
              </p>
            )}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setTab("overdue")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            tab === "overdue"
              ? "border-b-2 border-red-500 text-red-600"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Overdue ({overdue.length})
        </button>
        <button
          onClick={() => setTab("upcoming")}
          className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
            tab === "upcoming"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Upcoming ({upcoming.length})
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y max-h-[380px]">
        {loading ? (
          <div className="p-4 space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted" />)}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <CheckCircle className="size-6 text-green-600" />
            </div>
            <p className="text-sm font-medium">
              {tab === "overdue" ? "No overdue recalls" : "No upcoming recalls"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === "overdue"
                ? "All patients are up to date"
                : "No patients due in the next 30 days"}
            </p>
          </div>
        ) : (
          list.map((entry) => {
            const key = `${entry.patient_id}-${entry.service_id}`;
            return (
              <div key={key} className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{entry.patient_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.service_name} · Last:{" "}
                    {new Date(entry.last_visit).toLocaleDateString()}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {formatDue(entry)}
                  {entry.patient_phone && (
                    <button
                      onClick={() => sendWhatsApp(entry)}
                      disabled={sending === key}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-2.5 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      <Send className="size-3" />
                      Remind
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {toast && (
        <div className="mx-4 mb-4 mt-2 rounded-xl bg-foreground text-background px-4 py-2.5 text-sm font-medium text-center animate-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  );
}