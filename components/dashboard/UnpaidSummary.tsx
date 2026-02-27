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
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Outstanding Invoices</h2>
        {total > 0 && (
          <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
            {format(total)}
          </span>
        )}
      </div>

      {top5.length === 0 ? (
        <p className="text-xs text-green-600 text-center py-3 flex items-center justify-center gap-1">
          <CheckCircle className="size-3.5 inline-block" />
          All invoices paid
        </p>
      ) : (
        <div className="space-y-1.5">
          {top5.map((inv) => {
            const patient = inv.patient as Record<string, string> | undefined;
            const days = Number(inv.days_outstanding ?? 0);
            return (
              <div
                key={inv.id as string}
                onClick={() => router.push(`/${locale}/billing/${inv.id}`)}
                className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/50 px-1 py-1 rounded transition-colors"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    router.push(`/${locale}/billing/${inv.id}`);
                }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">
                    {patient?.first_name} {patient?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {inv.invoice_number as string}
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="text-xs font-bold">
                    {format(Number(inv.balance_due ?? 0))}
                  </p>
                  <p
                    className={`text-xs ${
                      days > 60
                        ? "text-red-600"
                        : days > 30
                          ? "text-orange-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {days}d
                  </p>
                </div>
              </div>
            );
          })}
          <button
            onClick={() => router.push(`/${locale}/billing`)}
            className="text-xs text-primary hover:underline w-full text-center pt-1"
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
