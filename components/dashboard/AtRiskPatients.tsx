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
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Patients Needing Attention</h2>
        {patients.length > 0 && (
          <span className="text-xs font-bold text-red-600">
            {patients.length}
          </span>
        )}
      </div>

      {patients.length === 0 ? (
        <p className="text-xs text-green-600 text-center py-3 flex items-center justify-center gap-1">
          <CheckCircle className="size-3.5 inline-block" />
          No at-risk patients
        </p>
      ) : (
        <div className="space-y-1.5">
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
                className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/50 px-1 py-1 rounded transition-colors"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    router.push(`/${locale}/patients/${patient.id}`);
                }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">
                    {patient.first_name as string}{" "}
                    {patient.last_name as string}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {patient.phone as string}
                  </p>
                </div>
                <p className="text-xs text-red-600 font-medium shrink-0">
                  {lastSeen}d ago
                </p>
              </div>
            );
          })}
          {patients.length > 5 && (
            <button
              onClick={() => router.push(`/${locale}/patients`)}
              className="text-xs text-primary hover:underline w-full text-center pt-1"
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
