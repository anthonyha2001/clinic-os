"use client";
import { useState, useEffect } from "react";
import { Bell, UserX, RefreshCw, Loader2, CheckCircle, XCircle, Clock, Play } from "lucide-react";

type AutomationEvent = {
  id: string;
  event_type: string;
  status: string;
  scheduled_for: string;
  created_at: string;
  error_message?: string;
  payload?: Record<string, unknown>;
};

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  appointment_reminder: { label: "Appointment Reminder", icon: "🔔" },
  no_show_followup:     { label: "No-Show Followup",     icon: "👻" },
  recall_due:           { label: "Recall Due",            icon: "📅" },
  auto_invoice:         { label: "Auto Invoice",          icon: "🧾" },
};

export function AutomationLog() {
  const [events, setEvents] = useState<AutomationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function fetchEvents() {
    const res = await fetch("/api/automation/events", { credentials: "include" });
    if (res.ok) setEvents(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchEvents(); }, []);

  async function trigger(action: string) {
    setTriggering(action);
    setResult(null);
    try {
      const res = await fetch("/api/automation/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setResult(data);
      await fetchEvents();
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Manual trigger buttons */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="font-semibold text-sm mb-3">Manual Triggers</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { action: "send_reminders", label: "Send Reminders", desc: "Tomorrow's appointments", icon: Bell, color: "text-blue-500" },
            { action: "send_noshows",   label: "No-Show Messages", desc: "Last hour no-shows", icon: UserX, color: "text-orange-500" },
            { action: "run_recalls",    label: "Run Recall Scan", desc: "6-month follow-ups", icon: RefreshCw, color: "text-purple-500" },
            { action: "run_all",        label: "Run All", desc: "Run everything now", icon: Play, color: "text-green-500" },
          ].map(({ action, label, desc, icon: Icon, color }) => (
            <button key={action} onClick={() => trigger(action)}
              disabled={!!triggering}
              className="flex items-center gap-3 rounded-xl border p-3 hover:bg-muted text-start disabled:opacity-50 transition-colors">
              {triggering === action
                ? <Loader2 className="size-5 animate-spin text-primary shrink-0" />
                : <Icon className={`size-5 ${color} shrink-0`} />
              }
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Result display */}
        {result && (
          <div className="mt-3 rounded-lg bg-muted/50 p-3 text-xs font-mono">
            {!!result.reminders && (
              <p>🔔 Reminders: {Number((result.reminders as Record<string, number>).sent ?? 0)} sent, {Number((result.reminders as Record<string, number>).failed ?? 0)} failed</p>
            )}
            {!!result.no_show_followups && (
              <p>👻 No-shows: {Number((result.no_show_followups as Record<string, number>).sent ?? 0)} sent, {Number((result.no_show_followups as Record<string, number>).failed ?? 0)} failed</p>
            )}
            {!!result.recalls && (
              <p>📅 Recalls: {Number((result.recalls as Record<string, number>).recalls_created ?? 0)} created</p>
            )}
            {typeof result.sent === "number" && (
              <p>✅ Sent: {result.sent}, Failed: {result.failed as number}, Total: {result.total as number}</p>
            )}
          </div>
        )}
      </div>

      {/* Event log */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Automation Log</h3>
          <button onClick={fetchEvents} className="p-1.5 rounded-lg hover:bg-muted">
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No automation events yet. Run a trigger above.</div>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {events.map(event => {
              const meta = EVENT_LABELS[event.event_type] ?? { label: event.event_type, icon: "⚙️" };
              return (
                <div key={event.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="text-lg shrink-0">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                    {event.error_message && (
                      <p className="text-xs text-red-500 mt-0.5 truncate">{event.error_message}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {event.status === "completed" && <CheckCircle className="size-4 text-green-500" />}
                    {event.status === "failed"    && <XCircle    className="size-4 text-red-500" />}
                    {event.status === "pending"   && <Clock      className="size-4 text-yellow-500" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}