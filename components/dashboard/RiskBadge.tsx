"use client";

import { useState } from "react";
import { Send, Loader2 } from "lucide-react";

type RiskLevel = "low" | "medium" | "high" | null;

function getRiskLevel(score: number | null | undefined): RiskLevel {
  if (score == null) return null;
  if (score < 30) return "low";
  if (score < 65) return "medium";
  return "high";
}

const RISK_CONFIG = {
  low:    { dot: "🟢", label: "Low risk",    color: "text-green-600",  bg: "bg-green-50  border-green-200" },
  medium: { dot: "🟡", label: "Medium risk", color: "text-amber-600",  bg: "bg-amber-50  border-amber-200" },
  high:   { dot: "🔴", label: "High risk",   color: "text-red-600",    bg: "bg-red-50    border-red-200"   },
};

export function RiskBadge({
  score,
  patientPhone,
  patientName,
  patientId,
}: {
  score: number | null | undefined;
  patientPhone?: string;
  patientName: string;
  patientId: string;
}) {
  const level = getRiskLevel(score);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!level) return null;

  const config = RISK_CONFIG[level];

  async function sendConfirmation() {
    if (!patientPhone) return;
    setSending(true);
    try {
      const message = `Hello ${patientName.split(" ")[0]}, this is a reminder from your dental clinic confirming your upcoming appointment. Please reply YES to confirm or call us to reschedule. Thank you!`;
      await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          to: patientPhone,
          message,
          patient_id: patientId,
          type: "appointment_confirmation",
        }),
      });
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${config.bg} ${config.color}`}>
      <span>{config.dot}</span>
      <span>{config.label}</span>
      {level === "high" && patientPhone && !sent && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            sendConfirmation();
          }}
          disabled={sending}
          className="ml-0.5 flex items-center gap-0.5 rounded bg-red-600 text-white px-1.5 py-0.5 text-[9px] hover:bg-red-700 disabled:opacity-50"
        >
          {sending ? <Loader2 className="size-2.5 animate-spin" /> : <Send className="size-2.5" />}
          Confirm
        </button>
      )}
      {sent && <span className="text-[9px] opacity-70">Sent ✓</span>}
    </div>
  );
}

// Standalone dot for compact views (e.g. calendar appointment card)
export function RiskDot({ score }: { score: number | null | undefined }) {
  const level = getRiskLevel(score);
  if (!level) return null;
  return (
    <span title={RISK_CONFIG[level].label} className="text-[11px] leading-none">
      {RISK_CONFIG[level].dot}
    </span>
  );
}

export { getRiskLevel };