"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart2,
  RefreshCw,
  Download,
  Send,
  Users,
  DollarSign,
  AlertCircle,
  UserPlus,
} from "lucide-react";

type EODData = {
  date: string;
  appointments: {
    total: number;
    completed: number;
    no_shows: number;
    canceled: number;
    scheduled: number;
  };
  new_patients: number;
  revenue: {
    total: number;
    invoice_count: number;
    by_method: { method: string; amount: number; count: number }[];
  };
  top_services: { service_name: string; count: number }[];
  providers: { provider_name: string; completed: number; no_shows: number }[];
};

export function EODSummaryWidget({ locale }: { locale: string }) {
  const [data, setData] = useState<EODData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/eod", { credentials: "include" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function downloadPDF() {
    const today = new Date().toISOString().split("T")[0];
    window.open(`/api/reports/eod?format=html&date=${today}`, "_blank");
  }

  async function sendWhatsApp() {
    if (!data) return;
    setSending(true);
    try {
      const text =
        `📊 *Daily Clinic Report – ${data.date}*\n\n` +
        `✅ Patients seen: ${data.appointments.completed}\n` +
        `💰 Revenue: $${Math.round(data.revenue.total).toLocaleString()}\n` +
        `❌ No-shows: ${data.appointments.no_shows}\n` +
        `🆕 New patients: ${data.new_patients}\n` +
        (data.revenue.by_method.length > 0
          ? `\n*Payment breakdown:*\n` +
            data.revenue.by_method
              .map((m) => `• ${m.method}: $${Math.round(m.amount).toLocaleString()}`)
              .join("\n")
          : "");

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: text, type: "eod_report", to_owner: true }),
      });
      setToast(res.ok ? "✅ Report sent to WhatsApp" : "❌ Failed to send");
    } catch {
      setToast("❌ Network error");
    } finally {
      setSending(false);
    }
  }

  const statCards = data
    ? [
        {
          label: "Patients Seen",
          value: data.appointments.completed,
          icon: Users,
          color: "text-blue-600",
          bg: "bg-blue-100",
        },
        {
          label: "Revenue",
          value: `$${Math.round(data.revenue.total).toLocaleString()}`,
          icon: DollarSign,
          color: "text-green-600",
          bg: "bg-green-100",
        },
        {
          label: "No-Shows",
          value: data.appointments.no_shows,
          icon: AlertCircle,
          color: "text-red-600",
          bg: "bg-red-100",
        },
        {
          label: "New Patients",
          value: data.new_patients,
          icon: UserPlus,
          color: "text-purple-600",
          bg: "bg-purple-100",
        },
      ]
    : [];

  return (
    <div className="app-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
            <BarChart2 className="size-4 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Today's Summary</h2>
            <p className="text-xs text-muted-foreground">
              {new Date().toLocaleDateString(locale, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={sendWhatsApp}
            disabled={sending || !data}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            <Send className="size-3.5" />
            WhatsApp
          </button>
          <button
            onClick={downloadPDF}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Download className="size-3.5" />
            PDF
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-5 space-y-3 animate-pulse">
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-muted" />)}
          </div>
          <div className="h-32 rounded-xl bg-muted" />
        </div>
      ) : !data ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          Failed to load report
        </div>
      ) : (
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {statCards.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-xl border bg-card p-3.5">
                <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${bg} mb-2`}>
                  <Icon className={`size-4 ${color}`} />
                </div>
                <p className="text-xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Payment breakdown */}
          {data.revenue.by_method.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Revenue by Method
              </h3>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {data.revenue.by_method.map((m) => (
                      <tr key={m.method} className="border-b last:border-0">
                        <td className="px-3 py-2 text-sm">{m.method}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          ${Math.round(m.amount).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30">
                      <td className="px-3 py-2 text-sm font-bold">Total</td>
                      <td className="px-3 py-2 text-right font-bold text-green-600">
                        ${Math.round(data.revenue.total).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Provider breakdown */}
          {data.providers.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Providers
              </h3>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Provider</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Seen</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">No-show</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providers.map((p) => (
                      <tr key={p.provider_name} className="border-b last:border-0">
                        <td className="px-3 py-2">{p.provider_name}</td>
                        <td className="px-3 py-2 text-right font-medium">{p.completed}</td>
                        <td className="px-3 py-2 text-right text-red-500">{p.no_shows || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top services */}
          {data.top_services.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Top Services
              </h3>
              <div className="space-y-1.5">
                {data.top_services.map((s, i) => {
                  const max = data.top_services[0].count;
                  const pct = Math.round((s.count / max) * 100);
                  return (
                    <div key={s.service_name} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs truncate">{s.service_name}</span>
                          <span className="text-xs font-medium ml-2 shrink-0">{s.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="mx-4 mb-4 rounded-xl bg-foreground text-background px-4 py-2.5 text-sm font-medium text-center animate-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  );
}