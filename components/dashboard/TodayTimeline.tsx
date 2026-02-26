"use client";

const HOUR_START = 7;
const HOUR_END = 20;
const HOURS = Array.from(
  { length: HOUR_END - HOUR_START },
  (_, i) => HOUR_START + i
);

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-200 border-blue-400 text-blue-900",
  confirmed: "bg-green-200 border-green-400 text-green-900",
  completed: "bg-gray-200 border-gray-400 text-gray-700",
  canceled: "bg-red-100 border-red-300 text-red-700 opacity-50",
  no_show: "bg-orange-100 border-orange-300 text-orange-700 opacity-60",
};

type Appointment = Record<string, unknown>;
type Provider = Record<string, unknown>;

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
  const nowMinutes =
    (now.getHours() - HOUR_START) * 60 + now.getMinutes();
  const totalMinutes = (HOUR_END - HOUR_START) * 60;
  const nowPct = Math.min(
    Math.max((nowMinutes / totalMinutes) * 100, 0),
    100
  );
  const isToday = true;

  const activeProviders = providers.filter((p) =>
    appointments.some(
      (a) =>
        a.provider_id === p.id ||
        (a.provider as Record<string, unknown>)?.id === p.id
    )
  );

  function getAppointmentsForProvider(providerId: unknown) {
    return appointments.filter(
      (a) =>
        a.provider_id === providerId ||
        (a.provider as Record<string, unknown>)?.id === providerId
    );
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

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">
          Today&apos;s Timeline
        </h2>
        <p className="text-center text-muted-foreground text-sm py-8">
          No appointments scheduled for today.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Today&apos;s Timeline</h2>
        <span className="text-xs text-muted-foreground">
          {appointments.length} appointments
        </span>
      </div>

      <div className="flex overflow-x-auto">
        <div className="w-12 shrink-0 relative" style={{ height: 320 }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute text-xs text-muted-foreground text-end pe-1"
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
          style={{ height: 320 }}
        >
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute w-full border-t border-border/40 pointer-events-none"
              style={{
                top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%`,
              }}
            />
          ))}

          {isToday &&
            nowMinutes > 0 &&
            nowMinutes < totalMinutes && (
              <div
                className="absolute w-full z-20 pointer-events-none flex items-center"
                style={{ top: `${nowPct}%` }}
              >
                <div className="h-2 w-2 rounded-full bg-red-500 shrink-0 -ms-1" />
                <div className="h-px bg-red-500 flex-1" />
              </div>
            )}

          {activeProviders.length === 0 ? (
            <div className="flex-1 relative">
              {appointments.map((appt) => {
                const start = (appt.start_time ?? appt.startTime) as string;
                const end = (appt.end_time ?? appt.endTime) as string;
                if (!start || !end) return null;
                return (
                  <div
                    key={appt.id as string}
                    className={`absolute inset-x-0.5 rounded border text-xs p-1 overflow-hidden cursor-pointer ${
                      STATUS_STYLES[appt.status as string] ?? "bg-gray-100"
                    }`}
                    style={{
                      top: `${getTopPct(start)}%`,
                      height: `${getHeightPct(start, end)}%`,
                    }}
                  >
                    <p className="font-medium truncate">
                      {(appt.patient as Record<string, string>)?.first_name}{" "}
                      {(appt.patient as Record<string, string>)?.last_name}
                    </p>
                    <p className="truncate opacity-70">
                      {(appt.service as Record<string, string>)?.name_en ??
                        (appt as Record<string, string>).serviceName}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            activeProviders.map((provider) => (
              <div
                key={provider.id as string}
                className="flex-1 relative min-w-16"
              >
                <div
                  className="text-xs text-center font-medium text-muted-foreground truncate mb-1 px-1"
                  style={{ fontSize: "10px" }}
                >
                  {(provider.user as Record<string, string> | undefined)
                    ?.full_name?.split(" ")[0] ?? "Provider"}
                </div>
                {getAppointmentsForProvider(provider.id).map((appt) => {
                  const start = (appt.start_time ?? appt.startTime) as string;
                  const end = (appt.end_time ?? appt.endTime) as string;
                  if (!start || !end) return null;
                  const colorHex =
                    (provider.color_hex as string) ?? "#3B82F6";
                  return (
                    <div
                      key={appt.id as string}
                      className="absolute inset-x-0.5 rounded border text-xs p-1 overflow-hidden cursor-pointer hover:brightness-95 transition-all"
                      style={{
                        top: `${getTopPct(start)}%`,
                        height: `${getHeightPct(start, end)}%`,
                        backgroundColor: colorHex + "25",
                        borderColor: colorHex,
                        borderLeftWidth: 3,
                      }}
                    >
                      <p
                        className="font-medium truncate leading-tight"
                        style={{ fontSize: "10px" }}
                      >
                        {(appt.patient as Record<string, string>)?.first_name}
                      </p>
                      <p
                        className="truncate opacity-70 leading-tight"
                        style={{ fontSize: "9px" }}
                      >
                        {(appt.service as Record<string, string>)?.name_en ??
                          (appt as Record<string, string>).serviceName}
                      </p>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-3 mt-3 flex-wrap">
        {Object.entries({
          scheduled: "Scheduled",
          confirmed: "Confirmed",
          completed: "Done",
          no_show: "No Show",
        }).map(([status, label]) => {
          const count = appointments.filter(
            (a) => a.status === status
          ).length;
          if (count === 0) return null;
          return (
            <div
              key={status}
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <span
                className={`h-2 w-2 rounded-full inline-block ${
                  status === "scheduled"
                    ? "bg-blue-400"
                    : status === "confirmed"
                      ? "bg-green-400"
                      : status === "completed"
                        ? "bg-gray-400"
                        : "bg-orange-400"
                }`}
              />
              {count} {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
