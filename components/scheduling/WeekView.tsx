"use client";

import { useState } from "react";
import { Clock, Phone, Stethoscope } from "lucide-react";

type Appointment = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-slate-50 border-slate-300 text-slate-700",
  confirmed: "bg-[#1E88E5]/8 border-[#1E88E5]/40 text-slate-800",
  completed: "bg-slate-100 border-slate-300 text-slate-600",
  canceled: "bg-slate-100 border-slate-300 text-slate-500",
  no_show: "bg-slate-100 border-slate-300 text-slate-700",
};

const TOOLTIP_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  canceled: "bg-red-100 text-red-700",
  no_show: "bg-orange-100 text-orange-700",
  in_progress: "bg-yellow-100 text-yellow-700",
};

export function WeekView({
  weekStart,
  appointments,
  selectedDate,
  onSelectDate,
  onAppointmentClick,
  locale,
}: {
  weekStart: Date;
  appointments: Appointment[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onAppointmentClick: (appt: Appointment) => void;
  locale: string;
}) {
  const today = new Date();
  const [tooltip, setTooltip] = useState<{
    appt: Appointment;
    x: number;
    y: number;
  } | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  function getAppts(day: Date) {
    return appointments
      .filter((a) => {
        const start = (a.start_time ?? a.startTime) as string | undefined;
        if (!start) return false;
        const d = new Date(start);
        return d.toDateString() === day.toDateString();
      })
      .sort(
        (a, b) =>
          new Date((a.start_time ?? a.startTime) as string).getTime() -
          new Date((b.start_time ?? b.startTime) as string).getTime()
      );
  }

  function getTooltipPosition(rect: DOMRect) {
    const tooltipWidth = 256;
    const tooltipHeight = 200;
    const offset = 8;
    const x =
      rect.right + offset + tooltipWidth > window.innerWidth
        ? rect.left - tooltipWidth - offset
        : rect.right + offset;
    const y =
      rect.top + tooltipHeight > window.innerHeight
        ? rect.bottom - tooltipHeight
        : rect.top;
    return { x: Math.max(8, x), y: Math.max(8, y) };
  }

  return (
    <div className="h-full flex flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-border/70">
        {days.map((day) => {
          const isToday = day.toDateString() === today.toDateString();
          const isSelected = day.toDateString() === selectedDate.toDateString();
          const dayAppts = getAppts(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`border-e border-border/70 p-2 text-center transition-colors last:border-e-0 hover:bg-muted/50 ${isSelected ? "bg-primary/5" : ""}`}
            >
              <p className="text-xs text-muted-foreground">
                {day.toLocaleDateString(locale, { weekday: "short" })}
              </p>
              <div
                className={`text-lg font-bold mx-auto flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                  isToday
                    ? "bg-primary/12 text-primary"
                    : isSelected
                      ? "bg-primary/10 text-primary"
                      : ""
                }`}
              >
                {day.getDate()}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {dayAppts.length || ""}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid flex-1 grid-cols-7 divide-x divide-border/70 overflow-y-auto">
        {days.map((day) => {
          const dayAppts = getAppts(day);
          const isToday = day.toDateString() === today.toDateString();

          return (
            <div
              key={day.toISOString()}
              className={`space-y-1.5 p-2 ${isToday ? "bg-primary/5" : ""}`}
            >
              {dayAppts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 opacity-40">
                  —
                </p>
              ) : (
                dayAppts.map((appt) => {
                  const patient = appt.patient as Record<string, string> | undefined;
                  const service = appt.service as Record<string, string> | undefined;
                  const provider = appt.provider as Record<string, unknown> | undefined;
                  const colorHex = (provider?.color_hex as string) ?? "#6B7280";
                  const startTime = new Date(
                    (appt.start_time ?? appt.startTime) as string
                  );

                  return (
                    <div
                      key={appt.id as string}
                      onClick={() => onAppointmentClick(appt)}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pos = getTooltipPosition(rect);
                        setTooltip({ appt, x: pos.x, y: pos.y });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      className={`cursor-pointer rounded-xl border px-2 py-1.5 text-xs transition-all hover:brightness-95 ${STATUS_COLORS[appt.status as string] ?? "bg-slate-100"}`}
                      style={{ borderLeftColor: colorHex }}
                    >
                      <p className="font-medium truncate leading-tight">
                        {startTime.toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        {patient?.first_name}
                      </p>
                      {service?.name_en && (
                        <p className="opacity-70 truncate leading-tight">
                          {service.name_en}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
      {tooltip && (
        <div
          className="fixed z-[300] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translateY(0)",
          }}
        >
          {(() => {
            const appt = tooltip.appt;
            const patient = appt.patient as Record<string, string> | undefined;
            const service = appt.service as Record<string, string> | undefined;
            const provider = appt.provider as Record<string, unknown> | undefined;
            const startRaw = (appt.start_time ?? appt.startTime) as string | undefined;
            const endRaw = (appt.end_time ?? appt.endTime) as string | undefined;
            const start = startRaw ? new Date(startRaw) : null;
            const end = endRaw ? new Date(endRaw) : null;
            const duration = start && end
              ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
              : Number(appt.duration_minutes ?? 0);
            const patientName =
              (appt.patient_name as string | undefined) ??
              `${patient?.first_name ?? ""} ${patient?.last_name ?? ""}`.trim() ??
              "Patient";
            const providerName =
              ((provider?.user as Record<string, string> | undefined)?.full_name as string | undefined) ??
              (provider?.full_name as string | undefined) ??
              "Provider";
            const providerColor = (provider?.color_hex as string) ?? "#6B7280";
            const status = String(appt.status ?? "scheduled");
            const statusClasses =
              TOOLTIP_STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700";
            return (
              <div className="w-64 rounded-xl border border-border/80 bg-white shadow-2xl p-3.5 space-y-2.5 animate-in fade-in-0 zoom-in-95 duration-150">
                <div className="font-semibold text-sm text-foreground leading-tight">
                  {patientName || "Patient"}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" />
                  {start
                    ? start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
                    : "--:--"}{" "}
                  –{" "}
                  {end
                    ? end.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
                    : "--:--"}{" "}
                  · {duration}min
                </div>

                {service?.name_en && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Stethoscope className="size-3.5 shrink-0" />
                    {service.name_en}
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: providerColor }} />
                  {providerName}
                </div>

                {patient?.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" />
                    {patient.phone}
                  </div>
                )}

                <div className="pt-1 border-t">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClasses}`}>
                    {status.replaceAll("_", " ")}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
