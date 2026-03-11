"use client";

import { useState } from "react";
import { Clock, Phone, Stethoscope } from "lucide-react";

const HOUR_START = 7;
const HOUR_END = 21;
const TOTAL_MINUTES = (HOUR_END - HOUR_START) * 60;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START },
  (_, i) => HOUR_START + i
);

const STATUS_STYLES: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  scheduled: { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-700" },
  confirmed: {
    bg: "bg-[#1E88E5]/8",
    border: "border-[#1E88E5]/40",
    text: "text-slate-800",
  },
  completed: { bg: "bg-slate-100", border: "border-slate-300", text: "text-slate-600" },
  canceled: { bg: "bg-slate-100", border: "border-slate-300", text: "text-slate-500" },
  no_show: {
    bg: "bg-slate-100",
    border: "border-slate-300",
    text: "text-slate-700",
  },
};

type Appointment = Record<string, unknown>;
type Provider = Record<string, unknown>;

const CHECKIN_DOT: Record<string, string> = {
  waiting: "bg-yellow-400",
  in_chair: "bg-blue-400",
  done: "bg-green-400",
};

const TOOLTIP_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  canceled: "bg-red-100 text-red-700",
  no_show: "bg-orange-100 text-orange-700",
  in_progress: "bg-yellow-100 text-yellow-700",
};

export function DayView({
  date,
  appointments,
  providers,
  checkinStatuses,
  selectedAppointmentId,
  onSlotClick,
  onAppointmentClick,
  workingHours,
  locale,
}: {
  date: Date;
  appointments: Appointment[];
  providers: Provider[];
  checkinStatuses?: Record<string, string>;
  selectedAppointmentId?: string;
  onSlotClick: (date: Date, providerId?: string) => void;
  onAppointmentClick: (appt: Appointment) => void;
  workingHours?: {
    from: string;
    to: string;
    open: boolean;
    break_from?: string | null;
    break_to?: string | null;
  } | null;
  locale: string;
}) {
  const now = new Date();
  const [tooltip, setTooltip] = useState<{
    appt: Appointment;
    x: number;
    y: number;
  } | null>(null);
  const isToday = date.toDateString() === now.toDateString();
  const nowMinutes = isToday
    ? (now.getHours() - HOUR_START) * 60 + now.getMinutes()
    : -1;
  const nowPct = (nowMinutes / TOTAL_MINUTES) * 100;

  function getTopPct(startTime: string) {
    const d = new Date(startTime);
    const mins = (d.getHours() - HOUR_START) * 60 + d.getMinutes();
    return Math.max(0, (mins / TOTAL_MINUTES) * 100);
  }

  function getHeightPct(startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = (end.getTime() - start.getTime()) / 60000;
    return Math.max(2, (duration / TOTAL_MINUTES) * 100);
  }

  const activeProviders = providers.filter((p) =>
    appointments.some(
      (a) =>
        a.provider_id === p.id ||
        (a.provider as Record<string, unknown>)?.id === p.id
    )
  );

  const columns = activeProviders.length > 0 ? activeProviders : [null];

  function parseHour(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const [h] = value.split(":");
    const parsed = Number.parseInt(h, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  const workingFromHour = parseHour(workingHours?.from, HOUR_START);
  const workingToHour = parseHour(workingHours?.to, HOUR_END);
  function parseTimeToMinutes(value: string | null | undefined, fallback: number): number {
    if (!value) return fallback;
    const [h, m] = value.split(":").map(Number);
    if (!isFinite(h)) return fallback;
    return h * 60 + (m ?? 0);
  }
  const breakFromMins = workingHours?.break_from
    ? parseTimeToMinutes(workingHours.break_from, -1)
    : -1;
  const breakToMins = workingHours?.break_to
    ? parseTimeToMinutes(workingHours.break_to, -1)
    : -1;
  const hasBreak = breakFromMins > 0 && breakToMins > breakFromMins;
  const isDayClosed = workingHours?.open === false;

  function getAppts(providerOrNull: Provider | null) {
    if (!providerOrNull) return appointments;
    return appointments.filter(
      (a) =>
        a.provider_id === providerOrNull.id ||
        (a.provider as Record<string, unknown>)?.id === providerOrNull.id
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
    <div className="flex h-full overflow-hidden">
      <div className="relative w-14 shrink-0 overflow-hidden border-e border-border/70">
        <div className="h-8 border-b border-border/70" />
        <div className="relative" style={{ height: "calc(100% - 2rem)" }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute w-full select-none pe-2 text-end text-[11px] text-muted-foreground"
              style={{
                top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%`,
                transform: "translateY(-50%)",
              }}
            >
              {h}:00
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-x-auto overflow-y-auto">
        {columns.map((provider, colIdx) => {
          const colAppts = getAppts(provider);
          const colorHex = (provider?.color_hex as string) ?? "#6B7280";

          return (
            <div
              key={provider ? (provider.id as string) : "all"}
              className={`flex min-w-32 flex-1 flex-col ${colIdx > 0 ? "border-s border-border/70" : ""}`}
            >
              <div className="flex h-8 shrink-0 items-center justify-center border-b border-border/70 px-2">
                {provider ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: colorHex }}
                    />
                    <span className="truncate text-xs font-medium text-foreground">
                      {(provider.user as Record<string, string> | undefined)
                        ?.full_name ?? "Provider"}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    All Providers
                  </span>
                )}
              </div>

              <div
                className="relative z-[1] flex-1 cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientY - rect.top) / rect.height;
                  const totalMins = pct * TOTAL_MINUTES;
                  const slotDate = new Date(date);
                  slotDate.setHours(
                    HOUR_START + Math.floor(totalMins / 60),
                    Math.floor((totalMins % 60) / 30) * 30,
                    0,
                    0
                  );
                  onSlotClick(slotDate, provider?.id as string | undefined);
                }}
              >
                {HOURS.map((h) => {
                  const isOutsideHours = isDayClosed || h < workingFromHour || h >= workingToHour;
                  return (
                    <div
                      key={`bg-${h}`}
                      className={`absolute inset-x-0 z-0 pointer-events-none ${
                        isOutsideHours
                          ? "bg-muted/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.03)_4px,rgba(0,0,0,0.03)_8px)]"
                          : ""
                      }`}
                      style={{
                        top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%`,
                        height: `${(1 / (HOUR_END - HOUR_START)) * 100}%`,
                      }}
                    />
                  );
                })}

                {hasBreak && (
                  <div
                    className="absolute inset-x-0 z-[2] pointer-events-none"
                    style={{
                      top: `${((breakFromMins - HOUR_START * 60) / TOTAL_MINUTES) * 100}%`,
                      height: `${((breakToMins - breakFromMins) / TOTAL_MINUTES) * 100}%`,
                      background:
                        "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.025) 4px, rgba(0,0,0,0.025) 8px)",
                      backgroundColor: "hsl(var(--muted) / 0.5)",
                    }}
                  >
                    {(breakToMins - breakFromMins) >= 30 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[9px] font-medium text-muted-foreground/50 tracking-wider uppercase select-none bg-background/60 px-2 py-0.5 rounded-full">
                          Break
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute z-[1] w-full border-t border-border/40 pointer-events-none"
                    style={{
                      top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%`,
                    }}
                  />
                ))}
                {HOURS.map((h) => (
                  <div
                    key={`${h}.5`}
                    className="absolute z-[1] w-full border-t border-border/20 border-dashed pointer-events-none"
                    style={{
                      top: `${((h - HOUR_START + 0.5) / (HOUR_END - HOUR_START)) * 100}%`,
                    }}
                  />
                ))}

                {isToday && nowPct > 0 && nowPct < 100 && (
                  <div
                    className="absolute w-full z-20 pointer-events-none flex items-center"
                    style={{ top: `${nowPct}%` }}
                  >
                    <div className="h-1.5 w-1.5 -ms-1 shrink-0 rounded-full bg-[#1E88E5]" />
                    <div className="h-px flex-1 bg-[#1E88E5]/70" />
                  </div>
                )}

                <div className="relative z-10 h-full">
                  {colAppts.map((appt) => {
                    const start = (appt.start_time ?? appt.startTime) as string;
                    const end = (appt.end_time ?? appt.endTime) as string;
                    if (!start || !end) return null;

                    const topPct = getTopPct(start);
                    const heightPct = getHeightPct(start, end);
                    const styles =
                      STATUS_STYLES[appt.status as string] ?? STATUS_STYLES.scheduled;
                    const isSelected = appt.id === selectedAppointmentId;
                    const patient = appt.patient as Record<string, string> | undefined;
                    const service = appt.service as Record<string, string> | undefined;
                    const startD = new Date(start);
                    const endD = new Date(end);
                    const durationMins = Math.round(
                      (endD.getTime() - startD.getTime()) / 60000
                    );
                    const apptColorHex = provider
                      ? colorHex
                      : ((appt.provider as Record<string, unknown>)?.color_hex as string) ??
                        "#6B7280";
                    const checkinStatus = checkinStatuses?.[appt.id as string];

                    // Canceled appointments render as empty clickable slot, not a block.
                    if (appt.status === "canceled") {
                      return (
                        <div
                          key={appt.id as string}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Click on canceled slot opens new appointment form for that time.
                            const slotDate = new Date(start);
                            onSlotClick(slotDate, provider?.id as string | undefined);
                          }}
                          className="absolute inset-x-1 z-10 cursor-pointer rounded-xl border border-dashed border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all duration-150 group"
                          style={{
                            top: `${topPct}%`,
                            height: `${heightPct}%`,
                            minHeight: "36px",
                          }}
                          title="Canceled — click to book this slot"
                        >
                          <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <span className="text-[10px] text-primary/60 font-medium">
                              + Book slot
                            </span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={appt.id as string}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAppointmentClick(appt);
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = getTooltipPosition(rect);
                          setTooltip({ appt, x: pos.x, y: pos.y });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        className={`absolute inset-x-1 z-10 cursor-pointer rounded-xl border px-2 py-1.5 transition-all hover:brightness-95 hover:z-20 ${styles.bg} ${isSelected ? "ring-2 ring-primary/35 ring-offset-1" : ""} ${durationMins < 20 ? "overflow-visible" : "overflow-hidden"}`}
                        style={{
                          top: `${topPct}%`,
                          height: `${heightPct}%`,
                          minHeight: "36px",
                          borderLeftColor: apptColorHex,
                          borderTopColor: "rgba(226,232,240,0.8)",
                          borderRightColor: "rgba(226,232,240,0.8)",
                          borderBottomColor: "rgba(226,232,240,0.8)",
                        }}
                      >
                        {checkinStatus && (
                          <span className={`absolute top-1 right-1 h-2 w-2 rounded-full ${CHECKIN_DOT[checkinStatus] ?? "bg-gray-400"}`} />
                        )}
                        <p
                          className={`text-xs font-semibold leading-tight truncate ${styles.text}`}
                        >
                          {patient?.first_name} {patient?.last_name}
                        </p>
                        {durationMins >= 30 && (
                          <p className="text-xs opacity-70 truncate leading-tight">
                            {service?.name_en} · {durationMins}min
                          </p>
                        )}
                        {durationMins >= 60 && patient?.phone && (
                          <p className="text-xs opacity-60 truncate leading-tight">
                            {patient.phone}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
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
