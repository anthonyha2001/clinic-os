"use client";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

type Appointment = Record<string, unknown>;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  no_show: "No Show",
  canceled: "Canceled",
};

const STATUS_PILL_CLASSES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
  no_show: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  canceled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
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
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col">
      <div className="shrink-0 border-b px-4 py-3 bg-muted/30 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Today&apos;s Schedule</h2>
        <button
            onClick={() => router.push(`/${locale}/appointments`)}
            className="text-xs font-medium text-[hsl(213,87%,53%)] hover:text-[hsl(213,87%,45%)] transition-colors duration-150 flex items-center gap-0.5"
            type="button"
          >
            View calendar
            <ArrowRight className="size-3" />
          </button>
      </div>

      <div className="p-4">
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          No appointments today
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
            const rawStatus = (appt.status as string) ?? "scheduled";
            const statusLabel = STATUS_LABELS[rawStatus] ?? rawStatus.replace("_", " ");
            const serviceName =
              ((service?.name_en ?? (appt as Record<string, string>).serviceName) as string) ?? "—";
            const providerFirstName =
              providerUser?.full_name?.split(" ")[0] ?? "—";

            return (
              <div
                key={appt.id as string}
                className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors duration-150"
                onClick={() => router.push(`/${locale}/appointments`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    router.push(`/${locale}/appointments`);
                }}
              >
                <div className="w-12 shrink-0 text-center">
                  <p className="w-full text-center text-xs font-mono font-medium text-foreground tabular-nums whitespace-nowrap">
                    {startTime.toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="w-px h-8 shrink-0 rounded-full bg-[hsl(213,87%,53%)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {patient?.first_name} {patient?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {serviceName} · {providerFirstName}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL_CLASSES[rawStatus] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                  {STATUS_LABELS[rawStatus] ?? rawStatus}
                </span>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
