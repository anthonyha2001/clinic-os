"use client";

type Appointment = Record<string, unknown>;

export function StatsBar({
  appointments,
  viewMode,
  selectedDate,
  locale,
}: {
  appointments: Appointment[];
  viewMode: "day" | "week";
  selectedDate: Date;
  locale: string;
}) {
  const total = appointments.length;
  const confirmed = appointments.filter((a) => a.status === "confirmed").length;
  const scheduled = appointments.filter((a) => a.status === "scheduled").length;
  const completed = appointments.filter((a) => a.status === "completed").length;
  const noShow = appointments.filter((a) => a.status === "no_show").length;
  const canceled = appointments.filter((a) => a.status === "canceled").length;

  const stats = [
    { label: "Total", value: total, color: "text-foreground" },
    { label: "Confirmed", value: confirmed, color: "text-green-600" },
    { label: "Pending", value: scheduled, color: "text-blue-600" },
    { label: "Done", value: completed, color: "text-gray-500" },
    { label: "No Show", value: noShow, color: "text-orange-600" },
    { label: "Canceled", value: canceled, color: "text-red-500" },
  ].filter((s) => s.value > 0 || s.label === "Total");

  return (
    <div className="app-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {viewMode === "day" ? "Today" : "This Week"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className={`text-xl font-bold leading-tight ${stat.color}`}>
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
            <div
              className="bg-green-500 h-full"
              style={{ width: `${(confirmed / total) * 100}%` }}
            />
            <div
              className="bg-blue-400 h-full"
              style={{ width: `${(scheduled / total) * 100}%` }}
            />
            <div
              className="bg-gray-400 h-full"
              style={{ width: `${(completed / total) * 100}%` }}
            />
            <div
              className="bg-orange-400 h-full"
              style={{ width: `${(noShow / total) * 100}%` }}
            />
            <div
              className="bg-red-300 h-full"
              style={{ width: `${(canceled / total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
