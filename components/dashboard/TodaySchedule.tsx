"use client";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

type Appointment = Record<string, unknown>;

const STATUS_BADGES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  completed: "bg-gray-100 text-gray-600",
  canceled: "bg-red-100 text-red-600",
  no_show: "bg-orange-100 text-orange-700",
};

export function TodaySchedule({
  appointments,
  locale,
}: {
  appointments: Appointment[];
  locale: string;
}) {
  const router = useRouter();
  const sorted = [...appointments].sort(
    (a, b) =>
      new Date((a.start_time ?? a.startTime) as string).getTime() -
      new Date((b.start_time ?? b.startTime) as string).getTime()
  );

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Today&apos;s Schedule</h2>
        <button
          onClick={() => router.push(`/${locale}/scheduling`)}
          className="text-xs text-primary hover:underline"
          type="button"
        >
          View calendar
          <ArrowRight className="size-3 inline-block ms-0.5" />
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          No appointments today.
        </p>
      ) : (
        <div className="space-y-1">
          {sorted.map((appt) => {
            const patient = appt.patient as Record<string, string> | undefined;
            const service = appt.service as Record<string, string> | undefined;
            const provider = appt.provider as Record<string, unknown> | undefined;
            const providerUser = provider?.user as Record<string, string> | undefined;
            const startTime = new Date(
              (appt.start_time ?? appt.startTime) as string
            );
            const colorHex =
              (provider?.color_hex as string) ?? "#6B7280";

            return (
              <div
                key={appt.id as string}
                className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => router.push(`/${locale}/scheduling`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    router.push(`/${locale}/scheduling`);
                }}
              >
                <div
                  className="h-8 w-1 rounded-full shrink-0"
                  style={{ backgroundColor: colorHex }}
                />
                <div className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
                  {startTime.toLocaleTimeString(locale, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {patient?.first_name} {patient?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(service?.name_en ?? (appt as Record<string, string>).serviceName) ?? "—"} ·{" "}
                    {providerUser?.full_name?.split(" ")[0] ?? "—"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-medium shrink-0 ${
                    STATUS_BADGES[appt.status as string] ?? ""
                  }`}
                >
                  {(appt.status as string)?.replace("_", " ")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
