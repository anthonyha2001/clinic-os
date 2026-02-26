"use client";

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
  scheduled: { bg: "bg-blue-50", border: "border-blue-400", text: "text-blue-900" },
  confirmed: {
    bg: "bg-green-50",
    border: "border-green-500",
    text: "text-green-900",
  },
  completed: { bg: "bg-gray-100", border: "border-gray-400", text: "text-gray-600" },
  canceled: { bg: "bg-red-50", border: "border-red-300", text: "text-red-700" },
  no_show: {
    bg: "bg-orange-50",
    border: "border-orange-300",
    text: "text-orange-800",
  },
};

type Appointment = Record<string, unknown>;
type Provider = Record<string, unknown>;

const CHECKIN_DOT: Record<string, string> = {
  waiting: "bg-yellow-400",
  in_chair: "bg-blue-400",
  done: "bg-green-400",
};

export function DayView({
  date,
  appointments,
  providers,
  checkinStatuses,
  selectedAppointmentId,
  onSlotClick,
  onAppointmentClick,
  locale,
}: {
  date: Date;
  appointments: Appointment[];
  providers: Provider[];
  checkinStatuses?: Record<string, string>;
  selectedAppointmentId?: string;
  onSlotClick: (date: Date, providerId?: string) => void;
  onAppointmentClick: (appt: Appointment) => void;
  locale: string;
}) {
  const now = new Date();
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

  function getAppts(providerOrNull: Provider | null) {
    if (!providerOrNull) return appointments;
    return appointments.filter(
      (a) =>
        a.provider_id === providerOrNull.id ||
        (a.provider as Record<string, unknown>)?.id === providerOrNull.id
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-14 shrink-0 border-e overflow-hidden relative">
        <div className="h-8 border-b" />
        <div className="relative" style={{ height: "calc(100% - 2rem)" }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute w-full text-xs text-muted-foreground text-end pe-2 select-none"
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
              className={`flex flex-col flex-1 min-w-32 ${colIdx > 0 ? "border-s" : ""}`}
            >
              <div className="h-8 border-b flex items-center justify-center shrink-0 px-2">
                {provider ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: colorHex }}
                    />
                    <span className="text-xs font-medium truncate">
                      {(provider.user as Record<string, string> | undefined)
                        ?.full_name?.split(" ")[0] ?? "Provider"}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    All Providers
                  </span>
                )}
              </div>

              <div
                className="relative flex-1 cursor-pointer"
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
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-border/40 pointer-events-none"
                    style={{
                      top: `${((h - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%`,
                    }}
                  />
                ))}
                {HOURS.map((h) => (
                  <div
                    key={`${h}.5`}
                    className="absolute w-full border-t border-border/20 border-dashed pointer-events-none"
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
                    <div className="h-2 w-2 rounded-full bg-red-500 -ms-1 shrink-0" />
                    <div className="h-px flex-1 bg-red-500" />
                  </div>
                )}

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

                  return (
                    <div
                      key={appt.id as string}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(appt);
                      }}
                      className={`absolute inset-x-0.5 rounded border-l-2 px-1.5 py-1 overflow-hidden cursor-pointer transition-all hover:brightness-95 ${styles.bg} ${isSelected ? "ring-2 ring-primary ring-offset-1" : ""}`}
                      style={{
                        top: `${topPct}%`,
                        height: `${heightPct}%`,
                        borderLeftColor: apptColorHex,
                        borderTopColor: "transparent",
                        borderRightColor: "transparent",
                        borderBottomColor: "transparent",
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
                      {heightPct > 4 && (
                        <p className="text-xs opacity-70 truncate leading-tight">
                          {service?.name_en} · {durationMins}min
                        </p>
                      )}
                      {heightPct > 6 && patient?.phone && (
                        <p className="text-xs opacity-60 truncate leading-tight">
                          {patient.phone}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
