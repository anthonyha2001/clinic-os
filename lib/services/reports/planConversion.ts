import { pgClient } from "@/db/index";

interface PlanConversionInput {
  orgId: string;
  startDate: string;
  endDate: string;
  providerId?: string;
}

interface ConversionMetrics {
  proposed: number;
  accepted: number;
  completed: number;
  canceled: number;
  conversionRate: number;
  completionRate: number;
}

interface ProviderMetrics {
  providerId: string;
  providerName: string;
  proposed: number;
  accepted: number;
  completed: number;
  canceled: number;
  conversionRate: number;
  completionRate: number;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function monthKey(dateInput: string | Date): string {
  const d = new Date(dateInput);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthsBetween(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  const months: string[] = [];
  while (cursor <= last) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function acceptedFromStatus(status: string): number {
  return ["accepted", "in_progress", "completed"].includes(status) ? 1 : 0;
}

export async function getPlanConversion(input: PlanConversionInput) {
  const { orgId, startDate, endDate, providerId } = input;

  const plans = await pgClient`
    SELECT
      p.id,
      p.provider_id,
      p.status,
      p.proposed_at,
      u.full_name AS provider_name
    FROM plans p
    LEFT JOIN provider_profiles pp ON pp.id = p.provider_id
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE p.organization_id = ${orgId}
      AND p.proposed_at >= ${startDate}::timestamptz
      AND p.proposed_at <= ${endDate}::timestamptz
      AND (${providerId ?? null}::uuid IS NULL OR p.provider_id = ${providerId ?? null}::uuid)
    ORDER BY p.proposed_at ASC
  `;

  let totalProposed = 0;
  let totalAccepted = 0;
  let totalCompleted = 0;
  let totalCanceled = 0;

  const monthMap = new Map<string, { proposed: number; accepted: number; completed: number; canceled: number }>();
  for (const m of monthsBetween(startDate, endDate)) {
    monthMap.set(m, { proposed: 0, accepted: 0, completed: 0, canceled: 0 });
  }

  const providerMap = new Map<string, { providerId: string; providerName: string; proposed: number; accepted: number; completed: number; canceled: number }>();

  for (const row of plans) {
    const status = String(row.status);
    const key = monthKey(row.proposed_at as string | Date);
    const monthMetrics = monthMap.get(key);
    if (!monthMetrics) {
      continue;
    }

    totalProposed += 1;
    monthMetrics.proposed += 1;

    const accepted = acceptedFromStatus(status);
    totalAccepted += accepted;
    monthMetrics.accepted += accepted;

    const completed = status === "completed" ? 1 : 0;
    totalCompleted += completed;
    monthMetrics.completed += completed;

    const canceled = status === "canceled" ? 1 : 0;
    totalCanceled += canceled;
    monthMetrics.canceled += canceled;

    if (!providerId) {
      const pid = String(row.provider_id);
      const name = row.provider_name ? String(row.provider_name) : "Unknown provider";
      const current = providerMap.get(pid) ?? {
        providerId: pid,
        providerName: name,
        proposed: 0,
        accepted: 0,
        completed: 0,
        canceled: 0,
      };
      current.proposed += 1;
      current.accepted += accepted;
      current.completed += completed;
      current.canceled += canceled;
      providerMap.set(pid, current);
    }
  }

  const byMonth = Array.from(monthMap.entries()).map(([month, m]) => ({
    month,
    proposed: m.proposed,
    accepted: m.accepted,
    completed: m.completed,
    canceled: m.canceled,
    conversionRate: safeDivide(m.accepted, m.proposed),
    completionRate: safeDivide(m.completed, m.accepted),
  }));

  const response: {
    summary: {
      totalProposed: number;
      totalAccepted: number;
      totalCompleted: number;
      totalCanceled: number;
      conversionRate: number;
      completionRate: number;
    };
    byMonth: ConversionMetrics[] & Array<{ month: string }>;
    byProvider?: ProviderMetrics[];
  } = {
    summary: {
      totalProposed,
      totalAccepted,
      totalCompleted,
      totalCanceled,
      conversionRate: safeDivide(totalAccepted, totalProposed),
      completionRate: safeDivide(totalCompleted, totalAccepted),
    },
    byMonth,
  };

  if (!providerId) {
    response.byProvider = Array.from(providerMap.values())
      .map((p) => ({
        providerId: p.providerId,
        providerName: p.providerName,
        proposed: p.proposed,
        accepted: p.accepted,
        completed: p.completed,
        canceled: p.canceled,
        conversionRate: safeDivide(p.accepted, p.proposed),
        completionRate: safeDivide(p.completed, p.accepted),
      }))
      .sort((a, b) => b.proposed - a.proposed || a.providerName.localeCompare(b.providerName));
  }

  return response;
}
