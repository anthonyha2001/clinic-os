"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Send, RefreshCw, ChevronDown, ChevronRight, DollarSign } from "lucide-react";

type PlanItem = {
  item_id: string;
  item_name: string;
  plan_name: string;
  qty_remaining: number;
  unit_price: number;
  remaining_value: number;
  item_last_visit: string | null;
};

type PatientEntry = {
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  provider_name: string;
  last_visit: string | null;
  total_remaining_value: number;
  items: PlanItem[];
};

type Summary = {
  total_patients: number;
  total_remaining_value: number;
  total_items: number;
};

export function UntreatedPlansWidget({ locale }: { locale: string }) {
  const [patients, setPatients] = useState<PatientEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/untreated-plans", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPatients(data.patients ?? []);
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

  async function sendWhatsApp(patient: PatientEntry, item: PlanItem) {
    setSending(item.item_id);
    try {
      const message = `Hello ${patient.patient_name.split(" ")[0]}, this is a reminder from your dental clinic. Your *${item.item_name}* treatment is still pending. Would you like to schedule your next appointment? Please reply or call us to book.`;
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to: patient.patient_phone,
          message,
          patient_id: patient.patient_id,
          type: "untreated_plan_reminder",
        }),
      });
      if (res.ok) {
        setToast(`✅ WhatsApp sent to ${patient.patient_name}`);
      } else {
        setToast("❌ Failed to send WhatsApp");
      }
    } catch {
      setToast("❌ Network error");
    } finally {
      setSending(null);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function timeAgo(dateStr: string | null) {
    if (!dateStr) return "Never visited";
    const months = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    if (months === 0) return "This month";
    if (months === 1) return "1 month ago";
    return `${months} months ago`;
  }

  return (
    <div className="app-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
            <AlertTriangle className="size-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Untreated Plans</h2>
            {summary && (
              <p className="text-xs text-muted-foreground">
                {summary.total_patients} patients · ${summary.total_remaining_value.toLocaleString()} pending
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

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-3 divide-x border-b bg-muted/20">
          {[
            { label: "Patients", value: summary.total_patients },
            { label: "Treatments", value: summary.total_items },
            { label: "Revenue", value: `$${Math.round(summary.total_remaining_value).toLocaleString()}` },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-2.5 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-bold text-amber-600">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y max-h-[420px]">
        {loading ? (
          <div className="p-4 space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted" />
            ))}
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <DollarSign className="size-6 text-green-600" />
            </div>
            <p className="text-sm font-medium">All plans up to date</p>
            <p className="text-xs text-muted-foreground mt-1">No pending treatments found</p>
          </div>
        ) : (
          patients.map((patient) => {
            const isOpen = expanded.has(patient.patient_id);
            return (
              <div key={patient.patient_id}>
                {/* Patient row */}
                <button
                  onClick={() => toggleExpand(patient.patient_id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate">{patient.patient_name}</p>
                      <span className="shrink-0 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">
                        {patient.items.length} pending
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Last visit: {timeAgo(patient.last_visit)} · Dr. {patient.provider_name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-amber-600">
                      ${Math.round(patient.total_remaining_value).toLocaleString()}
                    </p>
                    {isOpen ? (
                      <ChevronDown className="size-3.5 text-muted-foreground ml-auto mt-0.5" />
                    ) : (
                      <ChevronRight className="size-3.5 text-muted-foreground ml-auto mt-0.5" />
                    )}
                  </div>
                </button>

                {/* Expanded items */}
                {isOpen && (
                  <div className="bg-muted/20 border-t divide-y">
                    {patient.items.map((item) => (
                      <div
                        key={item.item_id}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.item_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.qty_remaining}x · ${Number(item.unit_price).toLocaleString()} each
                            {item.item_last_visit && ` · Last: ${timeAgo(item.item_last_visit)}`}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <p className="text-sm font-semibold">
                            ${Math.round(item.remaining_value).toLocaleString()}
                          </p>
                          {patient.patient_phone && (
                            <button
                              onClick={() => sendWhatsApp(patient, item)}
                              disabled={sending === item.item_id}
                              className="flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-2.5 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              <Send className="size-3" />
                              WhatsApp
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="mx-4 mb-4 mt-2 rounded-xl bg-foreground text-background px-4 py-2.5 text-sm font-medium text-center animate-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  );
}