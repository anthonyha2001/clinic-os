"use client";

import { useState } from "react";
import { Clock, Phone, Stethoscope } from "lucide-react";

const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START },
  (_, i) => HOUR_START + i
);

type Appointment = Record<string, unknown>;
type Provider = Record<string, unknown>;
const STATUS_ACCENT: Record<string, string> = {
  scheduled: "hsl(213,87%,53%)",
  confirmed: "#10B981",
  completed: "#10B981",
  canceled: "#EF4444",
  no_show: "#CBD5E1",
  in_progress: "#F59E0B",
};
const TOOLTIP_STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  canceled: "bg-red-100 text-red-700",
  no_show: "bg-orange-100 text-orange-700",
  in_progress: "bg-yellow-100 text-yellow-700",
};
const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-blue-400",
  confirmed: "bg-blue-500",
  completed: "bg-green-500",
  canceled: "bg-red-500",
  no_show: "bg-slate-400",
  in_progress: "bg-amber-400",
};

export function TodayTimeline({
  appointments,
  providers,
  locale,
}: {
  appointments: Appointment[];
  providers: Provider[];
  locale: string;
}) {
  const now = new Date();
  const [tooltip, setTooltip] = useState<{
    appt: Record<string, unknown>;
    x: number;
    y: number;
  } | null>(null);
  const nowMinutes =
    (now.getHours() - HOUR_START) * 60 + now.getMinutes();
  const totalMinutes = (HOUR_END - HOUR_START) * 60;
  const nowPct = Math.min(
    Math.max((nowMinutes / totalMinutes) * 100, 0),
    100
  );
  const isToday = true;

  const activeProviders = providers.filter((p) => {
    const providerId = String(p.id ?? "");
    return appointments.some((a) => {
      const apptProviderId = String(
        a.provider_id ??
        (a.provider as Record<string, unknown>)?.id ??
        ""
      );
      return apptProviderId === providerId && apptProviderId !== "";
    });
  });

  function getAppointmentsForProvider(providerId: unknown) {
    const id = String(providerId ?? "");
    return appointments.filter((a) => {
      const apptProviderId = String(
        a.provider_id ??
        (a.provider as Record<string, unknown>)?.id ??
        ""
      );
      return apptProviderId === id;
    });
  }

  function getTopPct(startTime: string) {
    const d = new Date(startTime);
    const mins =
      (d.getHours() - HOUR_START) * 60 + d.getMinutes();
    return Math.max((mins / totalMinutes) * 100, 0);
  }

  function getHeightPct(startTime: string, endTime: string) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = (end.getTime() - start.getTime()) / 60000;
    return Math.max((duration / totalMinutes) * 100, 2);
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

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
        <div className="shrink-0 border-b px-4 py-3 bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground">Today&apos;s Timeline</h2>
        </div>
        <p className="text-center text-muted-foreground text-sm py-8">
          No appointments scheduled for today.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
      <div className="shrink-0 border-b px-4 py-3 bg-muted/30 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Today&apos;s Timeline</h2>
        <span className="text-xs text-muted-foreground">
          {appointments.length} appointments
        </span>
      </div>

      <div className="flex overflow-x-auto p-4 min-h-[600px]">
        <div className="w-12 shrink-0 relative" style={{ height: 600, minHeight: 600 }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute text-[11px] text-muted-foreground/60 text-end pe-1"
              style={{
                top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%`,
                transform: "translateY(-50%)",
              }}
            >
              {h}:00
            </div>
          ))}
        </div>

        <div
          className="flex gap-1 flex-1 min-w-0 relative"
          style={{ height: 600, minHeight: 600 }}
        >
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute w-full border-t border-border/30 pointer-events-none"
              style={{
                top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%`,
              }}
            />
          ))}

          {isToday &&
            nowMinutes > 0 &&
            nowMinutes < totalMinutes && (
              <div
                className="absolute w-full z-20 pointer-events-none"
                style={{ top: `${nowPct}%` }}
              >
                <div className="relative flex items-center">
                  <div className="h-px flex-1 bg-foreground/25" />
                  <span className="absolute right-0 text-[9px] font-mono text-muted-foreground bg-card px-1 -top-3 border border-border/50 rounded">
                    {new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            )}

          {activeProviders.length === 0 ? (
            <div className="flex flex-1 flex-col">
              <div className="flex h-8 shrink-0 items-center justify-center border-b border-border/70 px-2">
                <span className="text-xs text-muted-foreground">All Providers</span>
              </div>
              <div className="relative flex-1">
                {appointments.map((appt) => {
                  const a = appt as Record<string, unknown>;
                  const start = (a.start_time ?? a.startTime) as string;
                  const end = (a.end_time ?? a.endTime) as string;
                  if (!start || !end) return null;
                  const durationMins = Math.round(
                    (new Date(end).getTime() - new Date(start).getTime()) / 60000
                  );
                  const colorHex = String(
                    a.provider_color ??
                    (a.provider as Record<string, unknown> | undefined)?.color_hex ??
                    "#64748B"
                  );
                  const patientName = String(
                    (a.patient as Record<string, string> | undefined)?.first_name ??
                    (a as Record<string, string>).patient_first_name ??
                    (a as Record<string, string>).patientName ??
                    "Patient"
                  );
                  const accentColor =
                    STATUS_ACCENT[String(a.status ?? "scheduled")] ?? colorHex;
                  const serviceName = String(
                    (a.service as Record<string, string> | undefined)?.name_en ??
                    (a as Record<string, string>).service_name ??
                    (a as Record<string, string>).serviceName ??
                    ""
                  );
                  return (
                    <div
                      key={a.id as string}
                      className={`absolute rounded-md cursor-pointer transition-all duration-150 hover:shadow-md hover:brightness-[0.97] hover:z-20 ${durationMins < 20 ? "overflow-visible z-10" : "overflow-hidden z-10"}`}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pos = getTooltipPosition(rect);
                        setTooltip({ appt: a, x: pos.x, y: pos.y });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        top: `${getTopPct(start)}%`,
                        height: `${getHeightPct(start, end)}%`,
                        minHeight: "44px",
                        left: "2px",
                        right: "2px",
                        backgroundColor: accentColor + "12",
                        borderLeft: `3px solid ${accentColor}`,
                        borderTop: `1px solid ${accentColor}25`,
                        borderRight: `1px solid ${accentColor}15`,
                        borderBottom: `1px solid ${accentColor}15`,
                      }}
                    >
                      <div className="px-2 py-1.5 h-full flex flex-col justify-start">
                        <span
                          className={`absolute top-1 right-1 h-2 w-2 rounded-full ${STATUS_DOT[String(a.status ?? "scheduled")] ?? "bg-slate-400"}`}
                        />
                        <p className="font-semibold leading-tight text-foreground truncate" style={{ fontSize: "11px" }}>
                          {patientName}
                        </p>
                        {durationMins >= 30 && (
                          <p className="leading-tight text-muted-foreground/70 truncate mt-0.5" style={{ fontSize: "9px" }}>
                            {serviceName}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            activeProviders.map((provider) => (
              <div
                key={provider.id as string}
                className="flex min-w-16 flex-1 flex-col"
              >
                <div className="flex h-8 shrink-0 items-center justify-center border-b border-border/70 px-2">
                  {(() => {
                    const p = provider as Record<string, unknown>;
                    const colorHex = String(
                      p.color_hex ??
                      p.colorHex ??
                      "#64748B"
                    );
                    const providerName = String(
                      ((p.user as Record<string, unknown> | undefined)
                        ?.full_name) ??
                      p.full_name ??
                      "Provider"
                    );
                    const firstName = providerName.split(" ")[0];
                    return (
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colorHex }} />
                        <span className="truncate text-xs font-medium text-foreground">
                          {firstName}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="relative flex-1">
                  {getAppointmentsForProvider(provider.id).map((appt) => {
                    const a = appt as Record<string, unknown>;
                    const start = (a.start_time ?? a.startTime) as string;
                    const end = (a.end_time ?? a.endTime) as string;
                    if (!start || !end) return null;
                    const durationMins = Math.round(
                      (new Date(end).getTime() - new Date(start).getTime()) / 60000
                    );
                    const p = provider as Record<string, unknown>;
                    const colorHex = String(
                      p.color_hex ??
                      p.colorHex ??
                      "#64748B"
                    );
                    const accentColor =
                      STATUS_ACCENT[String(a.status ?? "scheduled")] ?? colorHex;
                    const patientName = String(
                      (a.patient as Record<string, string> | undefined)?.first_name ??
                      (a as Record<string, string>).patient_first_name ??
                      (a as Record<string, string>).patientName ??
                      "Patient"
                    );
                    const serviceName = String(
                      (a.service as Record<string, string> | undefined)?.name_en ??
                      (a as Record<string, string>).service_name ??
                      (a as Record<string, string>).serviceName ??
                      ""
                    );
                    return (
                      <div
                        key={a.id as string}
                        className={`absolute rounded-md cursor-pointer transition-all duration-150 hover:shadow-md hover:brightness-[0.97] hover:z-20 ${durationMins < 20 ? "overflow-visible z-10" : "overflow-hidden z-10"}`}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = getTooltipPosition(rect);
                          setTooltip({ appt: a, x: pos.x, y: pos.y });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          top: `${getTopPct(start)}%`,
                          height: `${getHeightPct(start, end)}%`,
                          minHeight: "44px",
                          left: "2px",
                          right: "2px",
                          backgroundColor: accentColor + "12",
                          borderLeft: `3px solid ${accentColor}`,
                          borderTop: `1px solid ${accentColor}25`,
                          borderRight: `1px solid ${accentColor}15`,
                          borderBottom: `1px solid ${accentColor}15`,
                        }}
                      >
                        <div className="px-2 py-1.5 h-full flex flex-col justify-start">
                          <span
                            className={`absolute top-1 right-1 h-2 w-2 rounded-full ${STATUS_DOT[String(a.status ?? "scheduled")] ?? "bg-slate-400"}`}
                          />
                          <p className="font-semibold leading-tight text-foreground truncate" style={{ fontSize: "11px" }}>
                            {patientName}
                          </p>
                          {durationMins >= 30 && (
                            <p className="leading-tight text-muted-foreground/70 truncate mt-0.5" style={{ fontSize: "9px" }}>
                              {serviceName}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-4 px-4 py-3 border-t border-border/40 bg-muted/20">
        {[
          { status: "scheduled", label: "Scheduled", dotColor: "bg-blue-500" },
          { status: "confirmed", label: "Confirmed", dotColor: "bg-blue-500" },
          { status: "completed", label: "Completed", dotColor: "bg-green-500" },
          { status: "no_show", label: "No Show", dotColor: "bg-slate-400" },
        ].map(({ status, label, dotColor }) => {
          const count = appointments.filter((a) => a.status === status).length;
          if (count === 0) return null;
          return (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
              <span className="text-xs text-muted-foreground">{count} {label}</span>
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
            const providerColor =
              (appt.provider_color as string | undefined) ??
              (provider?.color_hex as string | undefined) ??
              "#6B7280";
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

                {(service?.name_en || (appt as Record<string, string>).service_name || (appt as Record<string, string>).serviceName) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Stethoscope className="size-3.5 shrink-0" />
                    {service?.name_en ??
                      (appt as Record<string, string>).service_name ??
                      (appt as Record<string, string>).serviceName}
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: providerColor }} />
                  {providerName}
                </div>

                {((patient?.phone as string | undefined) ?? (appt.phone as string | undefined)) && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="size-3.5 shrink-0" />
                    {(patient?.phone as string | undefined) ?? (appt.phone as string | undefined)}
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
