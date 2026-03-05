"use client";
import { useRouter } from "next/navigation";
import { CheckCircle, ArrowRight } from "lucide-react";
import { useCurrency } from "@/lib/context/CurrencyContext";

type Invoice = Record<string, unknown>;

export function UnpaidSummary({
  invoices,
  locale,
}: {
  invoices: Invoice[];
  locale: string;
}) {
  const router = useRouter();
  const { format } = useCurrency();
  const total = invoices.reduce(
    (s, i) => s + Number(i.balance_due ?? 0),
    0
  );
  const top5 = [...invoices]
    .sort(
      (a, b) =>
        Number(b.days_outstanding ?? 0) - Number(a.days_outstanding ?? 0)
    )
    .slice(0, 5);

  return (
    <div className="app-card">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
        <h2 className="text-sm font-semibold text-foreground">Outstanding Invoices</h2>
        <div className="text-xs">
          {total > 0 && (
            <span className="text-xs font-semibold text-foreground tabular-nums">
              {format(total)}
            </span>
          )}
        </div>
      </div>

      {top5.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div className="h-12 w-12 rounded-2xl border border-border/60 bg-muted/40 flex items-center justify-center">
            <CheckCircle className="size-5 text-muted-foreground/40" strokeWidth={1.5} />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              All settled
            </p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              No outstanding invoices
            </p>
          </div>
        </div>
      ) : (
        <div>
          {top5.map((inv) => {
            const patient = inv.patient as Record<string, string> | undefined;
            const days = Number(inv.days_outstanding ?? 0);
            return (
              <div
                key={inv.id as string}
                onClick={() => router.push(`/${locale}/billing/${inv.id}`)}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded transition-colors duration-150"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    router.push(`/${locale}/billing/${inv.id}`);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {patient?.first_name} {patient?.last_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {inv.invoice_number as string}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {format(Number(inv.balance_due ?? 0))}
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5 tabular-nums">
                    {days}d overdue
                  </p>
                </div>
              </div>
            );
          })}
          <button
            onClick={() => router.push(`/${locale}/billing`)}
            className="text-xs font-medium text-[hsl(213,87%,53%)] hover:text-[hsl(213,87%,45%)] transition-colors duration-150 w-full text-center pt-2 block"
            type="button"
          >
            View all {invoices.length} invoices
            <ArrowRight className="size-3 inline-block ms-0.5" />
          </button>
        </div>
      )}
    </div>
  );
}
