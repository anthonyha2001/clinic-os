"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Phone, Calendar, Loader2, CheckCircle, Clock, Play } from "lucide-react";

type Recall = {
  id: string;
  patient_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  due_date: string;
  last_visit_date: string;
  status: string;
  total_visits: number;
};

export function RecallList({ locale }: { locale: string }) {
  const router = useRouter();
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [loading, setLoading] = useState(true);
  const [runLoading, setRunLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchRecalls() {
    const res = await fetch("/api/recalls", { credentials: "include" });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const d = await res.json();
    const raw = Array.isArray(d) ? d : d?.recalls ?? d;
    setRecalls(Array.isArray(raw) ? raw : []);
    setLoading(false);
  }

  useEffect(() => { fetchRecalls(); }, []);

  async function runRecalls() {
    setRunLoading(true);
    await fetch("/api/automation/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "run_recalls" }),
    });
    await fetchRecalls();
    setRunLoading(false);
  }

  async function updateStatus(id: string, status: string) {
    setActionLoading(id);
    await fetch("/api/recalls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id, status }),
    });
    setRecalls(r => r.filter(x => x.id !== id));
    setActionLoading(null);
  }

  const overdue = recalls.filter(r => new Date(r.due_date) < new Date());
  const upcoming = recalls.filter(r => new Date(r.due_date) >= new Date());

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Patient Recalls</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Patients due for a checkup based on their last visit
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchRecalls} className="flex items-center gap-1.5 text-xs border rounded-lg px-3 py-1.5 hover:bg-muted">
            <RefreshCw className="size-3.5" /> Refresh
          </button>
          <button onClick={runRecalls} disabled={runLoading}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50">
            {runLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Run Recall Engine
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : recalls.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-muted-foreground">
          <CheckCircle className="size-10 mx-auto mb-2 text-green-400" />
          <p className="text-sm font-medium">No patients due for recall</p>
          <p className="text-xs mt-1">Run the recall engine to check for patients overdue for a visit</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Overdue */}
          {overdue.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">
                Overdue ({overdue.length})
              </p>
              <div className="rounded-xl border overflow-hidden divide-y">
                {overdue.map(r => (
                  <RecallRow key={r.id} recall={r} locale={locale}
                    isLoading={actionLoading === r.id}
                    onBook={() => router.push(`/${locale}/scheduling?patient_id=${r.patient_id}`)}
                    onContacted={() => updateStatus(r.id, "contacted")}
                    onDismiss={() => updateStatus(r.id, "dismissed")}
                    overdue />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Upcoming ({upcoming.length})
              </p>
              <div className="rounded-xl border overflow-hidden divide-y">
                {upcoming.map(r => (
                  <RecallRow key={r.id} recall={r} locale={locale}
                    isLoading={actionLoading === r.id}
                    onBook={() => router.push(`/${locale}/scheduling?patient_id=${r.patient_id}`)}
                    onContacted={() => updateStatus(r.id, "contacted")}
                    onDismiss={() => updateStatus(r.id, "dismissed")}
                    overdue={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecallRow({ recall, locale, isLoading, onBook, onContacted, onDismiss, overdue }: {
  recall: Recall; locale: string; isLoading: boolean;
  onBook: () => void; onContacted: () => void; onDismiss: () => void;
  overdue: boolean;
}) {
  const monthsSince = Math.floor((Date.now() - new Date(recall.last_visit_date).getTime()) / (1000 * 60 * 60 * 24 * 30));

  return (
    <div className="px-4 py-3 flex items-center gap-4 hover:bg-muted/20">
      <div className={`h-2 w-2 rounded-full shrink-0 ${overdue ? "bg-red-400" : "bg-yellow-400"}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{recall.first_name} {recall.last_name}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" />
            Last visit: {new Date(recall.last_visit_date).toLocaleDateString(locale)} ({monthsSince}mo ago)
          </span>
          <span className="text-xs text-muted-foreground">{recall.total_visits} total visits</span>
        </div>
        {recall.phone && (
          <a href={`tel:${recall.phone}`} className="text-xs text-primary flex items-center gap-0.5 mt-0.5 hover:underline w-fit">
            <Phone className="size-3" />{recall.phone}
          </a>
        )}
      </div>
      <div className={`text-xs font-medium shrink-0 ${overdue ? "text-red-500" : "text-muted-foreground"}`}>
        Due: {new Date(recall.due_date).toLocaleDateString(locale)}
      </div>
      <div className="flex gap-1.5 shrink-0">
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <button onClick={onBook}
              className="rounded-lg bg-primary text-primary-foreground px-2.5 py-1 text-xs font-medium hover:opacity-90 flex items-center gap-1">
              <Calendar className="size-3" /> Book
            </button>
            <button onClick={onContacted}
              className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted flex items-center gap-1">
              <Phone className="size-3" /> Contacted
            </button>
            <button onClick={onDismiss}
              className="rounded-lg border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted">
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}