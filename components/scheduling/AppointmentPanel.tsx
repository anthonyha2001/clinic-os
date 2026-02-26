"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, X, CheckCircle, AlertTriangle, FileText, Loader2 } from "lucide-react";

type Appointment = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600",
  canceled: "bg-red-100 text-red-700",
  no_show: "bg-orange-100 text-orange-700",
};

const TRANSITIONS: Record<string, { label: string; next: string; style: string }[]> = {
  scheduled: [
    { label: "Confirm", next: "confirmed", style: "bg-green-600 text-white hover:bg-green-700" },
    { label: "Cancel", next: "canceled", style: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200" },
  ],
  confirmed: [
    { label: "Mark Complete", next: "completed", style: "bg-primary text-primary-foreground hover:opacity-90" },
    { label: "No Show", next: "no_show", style: "bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200" },
    { label: "Cancel", next: "canceled", style: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200" },
  ],
};

export function AppointmentPanel({
  appointment,
  locale,
  onClose,
  onStatusChange,
  onNewAppointment,
}: {
  appointment: Appointment | null;
  locale: string;
  onClose: () => void;
  onStatusChange: (updated: Appointment) => void;
  onNewAppointment: () => void;
}) {
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<{ id: string; number: string } | null>(null);

  async function handleTransition(next: string) {
    if (!appointment) return;
    setActionLoading(next);
    setInvoiceError(null);
    setInvoiceSuccess(null);

    const res = await fetch(`/api/appointments/${appointment.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: next }),
    });

    const data = await res.json();
    if (res.ok) {
      // Re-fetch full appointment to get invoice_id populated by auto-invoice
      if (next === "completed") {
        await new Promise((r) => setTimeout(r, 800));
        const fullRes = await fetch(`/api/appointments/${appointment.id}`, {
          credentials: "include",
        });
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          onStatusChange({ ...appointment, ...(fullData.appointment ?? fullData) });
        } else {
          onStatusChange({ ...appointment, ...data });
        }
      } else {
        onStatusChange({ ...appointment, ...data });
      }
    }
    setActionLoading(null);
  }

  async function handleIssueInvoice() {
    if (!appointment) return;
    setInvoiceLoading(true);
    setInvoiceError(null);
    setInvoiceSuccess(null);

    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ appointment_id: appointment.id }),
    });

    const data = await res.json();

    if (!res.ok) {
      setInvoiceError(data.error ?? "Failed to create invoice.");
      setInvoiceLoading(false);
      return;
    }

    setInvoiceSuccess({
      id: data.id ?? data.invoice?.id,
      number: data.invoice_number ?? data.invoice?.invoice_number ?? "—",
    });
    setInvoiceLoading(false);
  }

  if (!appointment) {
    return (
      <div className="rounded-xl border bg-card h-full flex flex-col items-center justify-center p-6 text-center">
        <Calendar className="size-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">No appointment selected</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">Click an appointment to see details</p>
        <button onClick={onNewAppointment} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          + New Appointment
        </button>
      </div>
    );
  }

  const patient = appointment.patient as Record<string, string> | undefined;
  const provider = appointment.provider as Record<string, unknown> | undefined;
  const service = appointment.service as Record<string, string> | undefined;
  const planItem = appointment.plan_item as Record<string, unknown> | undefined;
  const startTime = new Date((appointment.start_time ?? appointment.startTime) as string);
  const endTime = new Date((appointment.end_time ?? appointment.endTime) as string);
  const durationMins = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
  const transitions = TRANSITIONS[appointment.status as string] ?? [];
  const colorHex = (provider?.color_hex as string) ?? "#6B7280";
  const patientId = (appointment.patient_id as string) ?? (appointment.patientId as string);
  const isCompleted = appointment.status === "completed";
  const hasInvoice = !!(appointment.invoice_id ?? appointment.invoiceId);

  return (
    <div className="rounded-xl border bg-card h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderLeftColor: colorHex, borderLeftWidth: 3 }}>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[appointment.status as string] ?? ""}`}>
          {(appointment.status as string)?.replace("_", " ")}
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Patient */}
        <div
          className="cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors"
          onClick={() => patientId && router.push(`/${locale}/patients/${patientId}`)}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Patient</p>
          <p className="font-semibold text-sm">{patient?.first_name} {patient?.last_name}</p>
          {patient?.phone && <p className="text-xs text-muted-foreground">{patient.phone}</p>}
        </div>

        {/* Time */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Time</p>
          <p className="text-sm font-medium">
            {startTime.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })}
          </p>
          <p className="text-sm text-muted-foreground">
            {startTime.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
            {" – "}
            {endTime.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
            {" "}
            <span className="text-xs">({durationMins}min)</span>
          </p>
        </div>

        {/* Service */}
        {service && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Service</p>
            <p className="text-sm font-medium">{service.name_en}</p>
          </div>
        )}

        {/* Provider */}
        {provider && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Provider</p>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colorHex }} />
              <p className="text-sm font-medium">
                {(provider.user as Record<string, string> | undefined)?.full_name ?? (provider as Record<string, string>).full_name}
              </p>
            </div>
          </div>
        )}

        {/* Linked plan item */}
        {planItem && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Treatment Plan</p>
            <p className="text-xs font-medium text-primary">
              {(planItem.plan as Record<string, string> | undefined)?.name_en ?? "Linked plan"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Session {Number(planItem.quantity_completed ?? 0)}/{Number(planItem.quantity_total ?? 0)}
            </p>
          </div>
        )}

        {/* Notes */}
        {appointment.notes && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm bg-muted rounded-lg p-2">{appointment.notes as string}</p>
          </div>
        )}

        {/* Deposit */}
        {appointment.deposit_required && (
          <div className={`rounded-lg px-3 py-2 text-xs font-medium ${appointment.deposit_paid ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
            {appointment.deposit_paid ? (
              <><CheckCircle className="size-3.5 inline-block me-1" />Deposit paid</>
            ) : (
              <><AlertTriangle className="size-3.5 inline-block me-1" />Deposit required</>
            )}
          </div>
        )}

        {/* Invoice section — show when completed */}
        {isCompleted && (
          <div className="rounded-xl border overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice</p>
            </div>
            <div className="p-3 space-y-2">
              {hasInvoice ? (
                <button
                  onClick={() => router.push(`/${locale}/billing/${appointment.invoice_id ?? appointment.invoiceId}`)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-colors"
                >
                  <FileText className="size-4" />
                  View Invoice {(appointment.invoice_number ?? appointment.invoiceNumber) ? ` #${String(appointment.invoice_number ?? appointment.invoiceNumber)}` : ""}
                </button>
              ) : invoiceSuccess ? (
                <div className="space-y-2">
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 font-medium flex items-center gap-2">
                    <CheckCircle className="size-3.5 shrink-0" />
                    Invoice {invoiceSuccess.number} created
                  </div>
                  <button
                    onClick={() => router.push(`/${locale}/billing/${invoiceSuccess.id}`)}
                    className="w-full flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                  >
                    <FileText className="size-4" />
                    Open Invoice
                  </button>
                </div>
              ) : (
                <>
                  {invoiceError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                      {invoiceError}
                    </div>
                  )}
                  <button
                    onClick={handleIssueInvoice}
                    disabled={invoiceLoading}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
                  >
                    {invoiceLoading ? (
                      <><Loader2 className="size-4 animate-spin" /> Creating invoice...</>
                    ) : (
                      <><FileText className="size-4" /> Issue Invoice</>
                    )}
                  </button>
                  <p className="text-xs text-muted-foreground text-center">
                    Auto-fills services and plan sessions
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status transitions */}
      {transitions.length > 0 && (
        <div className="p-4 border-t space-y-2">
          {transitions.map((t) => (
            <button
              key={t.next}
              onClick={() => handleTransition(t.next)}
              disabled={actionLoading !== null}
              className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${t.style}`}
            >
              {actionLoading === t.next ? <Loader2 className="size-4 animate-spin inline-block" /> : t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}