"use client";

type Appointment = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 border-blue-400 text-blue-800",
  confirmed: "bg-green-100 border-green-400 text-green-800",
  completed: "bg-gray-100 border-gray-400 text-gray-600",
  canceled: "bg-red-50 border-red-300 text-red-700",
  no_show: "bg-orange-50 border-orange-300 text-orange-700",
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

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b shrink-0">
        {days.map((day) => {
          const isToday = day.toDateString() === today.toDateString();
          const isSelected = day.toDateString() === selectedDate.toDateString();
          const dayAppts = getAppts(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDate(day)}
              className={`p-2 text-center border-e last:border-e-0 transition-colors hover:bg-muted/50 ${isSelected ? "bg-primary/5" : ""}`}
            >
              <p className="text-xs text-muted-foreground">
                {day.toLocaleDateString(locale, { weekday: "short" })}
              </p>
              <div
                className={`text-lg font-bold mx-auto flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                  isToday
                    ? "bg-primary text-primary-foreground"
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

      <div className="grid grid-cols-7 flex-1 overflow-y-auto divide-x">
        {days.map((day) => {
          const dayAppts = getAppts(day);
          const isToday = day.toDateString() === today.toDateString();

          return (
            <div
              key={day.toISOString()}
              className={`p-1.5 space-y-1 ${isToday ? "bg-blue-50/30 dark:bg-blue-950/10" : ""}`}
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
                      className={`rounded border-l-2 px-1.5 py-1 text-xs cursor-pointer hover:brightness-95 transition-all ${STATUS_COLORS[appt.status as string] ?? "bg-gray-100"}`}
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
    </div>
  );
}
