import { pgClient } from "@/db/index";

export type RevenueGroupBy = "day" | "week" | "month";

interface GetRevenueInput {
  orgId: string;
  groupBy: RevenueGroupBy;
  startDate: string;
  endDate: string;
  providerId?: string;
  serviceId?: string;
}

interface MethodBreakdown {
  type: string;
  label: string;
  amount: number;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function toPeriodStart(date: Date, groupBy: RevenueGroupBy): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  if (groupBy === "day") return d;
  if (groupBy === "week") {
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const diffToMonday = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diffToMonday);
    return d;
  }
  d.setUTCDate(1);
  return d;
}

function nextPeriod(date: Date, groupBy: RevenueGroupBy): Date {
  const d = new Date(date);
  if (groupBy === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (groupBy === "week") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

function periodIso(date: Date): string {
  return date.toISOString();
}

export async function getRevenue(input: GetRevenueInput) {
  const { orgId, groupBy, startDate, endDate, providerId, serviceId } = input;

  const rows = await pgClient`
    SELECT
      p.id AS payment_id,
      p.created_at,
      pa.amount AS allocation_amount,
      pm.type AS method_type,
      pm.label_en AS method_label
    FROM payments p
    JOIN payment_allocations pa ON pa.payment_id = p.id
    JOIN invoices i ON i.id = pa.invoice_id
    JOIN payment_methods pm ON pm.id = p.payment_method_id
    WHERE p.organization_id = ${orgId}
      AND p.created_at >= ${startDate}::timestamptz
      AND p.created_at <= ${endDate}::timestamptz
      AND (
        ${providerId ?? null}::uuid IS NULL
        OR EXISTS (
          SELECT 1
          FROM appointments a
          WHERE a.id = i.appointment_id
            AND a.provider_id = ${providerId ?? null}::uuid
        )
      )
      AND (
        ${serviceId ?? null}::uuid IS NULL
        OR EXISTS (
          SELECT 1
          FROM invoice_lines il
          WHERE il.invoice_id = i.id
            AND il.service_id = ${serviceId ?? null}::uuid
        )
      )
    ORDER BY p.created_at ASC
  `;

  const start = toPeriodStart(new Date(startDate), groupBy);
  const end = toPeriodStart(new Date(endDate), groupBy);

  const periodMap = new Map<
    string,
    { totalRevenue: number; paymentIds: Set<string>; methods: Map<string, MethodBreakdown> }
  >();
  for (let cursor = new Date(start); cursor <= end; cursor = nextPeriod(cursor, groupBy)) {
    periodMap.set(periodIso(cursor), {
      totalRevenue: 0,
      paymentIds: new Set<string>(),
      methods: new Map<string, MethodBreakdown>(),
    });
  }

  const summaryMethods = new Map<string, MethodBreakdown>();
  const summaryPaymentIds = new Set<string>();
  let summaryRevenue = 0;

  for (const row of rows) {
    const createdAt = new Date(row.created_at as string | Date);
    const bucket = periodIso(toPeriodStart(createdAt, groupBy));
    const amount = Number(row.allocation_amount ?? 0);
    const paymentId = String(row.payment_id);
    const methodType = String(row.method_type ?? "unknown");
    const methodLabel = String(row.method_label ?? methodType);
    const methodKey = `${methodType}|${methodLabel}`;

    const period = periodMap.get(bucket);
    if (!period) continue;

    period.totalRevenue += amount;
    period.paymentIds.add(paymentId);
    const existingPeriodMethod = period.methods.get(methodKey) ?? {
      type: methodType,
      label: methodLabel,
      amount: 0,
    };
    existingPeriodMethod.amount += amount;
    period.methods.set(methodKey, existingPeriodMethod);

    summaryRevenue += amount;
    summaryPaymentIds.add(paymentId);
    const existingSummaryMethod = summaryMethods.get(methodKey) ?? {
      type: methodType,
      label: methodLabel,
      amount: 0,
    };
    existingSummaryMethod.amount += amount;
    summaryMethods.set(methodKey, existingSummaryMethod);
  }

  const byPeriod = Array.from(periodMap.entries()).map(([period, data]) => ({
    period,
    totalRevenue: data.totalRevenue,
    paymentCount: data.paymentIds.size,
    breakdownByMethod: Array.from(data.methods.values()).sort((a, b) =>
      a.type.localeCompare(b.type)
    ),
  }));

  const paymentCount = summaryPaymentIds.size;
  return {
    summary: {
      totalRevenue: summaryRevenue,
      paymentCount,
      averagePayment: safeDivide(summaryRevenue, paymentCount),
      breakdownByMethod: Array.from(summaryMethods.values()).sort((a, b) =>
        a.type.localeCompare(b.type)
      ),
    },
    byPeriod,
  };
}
