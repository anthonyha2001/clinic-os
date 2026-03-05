"use client";
import { useRouter } from "next/navigation";
import { CheckCircle, ArrowRight } from "lucide-react";

type Patient = Record<string, unknown>;

export function AtRiskPatients({
  patients,
  locale,
}: {
  patients: Patient[];
  locale: string;
}) {
  const router = useRouter();

  return (
    <div className="app-card">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
        <h2 className="text-sm font-semibold text-foreground">Patients Needing Attention</h2>
        <div className="text-xs">
          {patients.length > 0 && (
            <span className="text-xs font-semibold text-foreground">
              {patients.length}
            </span>
          )}
        </div>
      </div>

      {patients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="h-12 w-12 rounded-2xl border border-border/60 bg-muted/40 flex items-center justify-center">
            <CheckCircle className="size-5 text-muted-foreground/40" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              No follow-ups needed
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              All patients are up to date
            </p>
          </div>
        </div>
      ) : (
        <div>
          {patients.slice(0, 5).map((patient) => {
            const lastSeen = Number(
              patient.days_since_last_visit ?? 0
            );
            return (
              <div
                key={patient.id as string}
                onClick={() =>
                  router.push(`/${locale}/patients/${patient.id}`)
                }
                className="flex items-center justify-between gap-3 py-2.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded transition-colors duration-150"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    router.push(`/${locale}/patients/${patient.id}`);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {patient.first_name as string}{" "}
                    {patient.last_name as string}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {patient.phone as string}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                  {lastSeen}d
                </p>
              </div>
            );
          })}
          {patients.length > 5 && (
            <button
              onClick={() => router.push(`/${locale}/patients`)}
              className="text-xs font-medium text-[hsl(213,87%,53%)] hover:text-[hsl(213,87%,45%)] transition-colors duration-150 w-full text-center pt-2 block"
              type="button"
            >
              +{patients.length - 5} more
              <ArrowRight className="size-3 inline-block ms-0.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
