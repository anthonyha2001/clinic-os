import { pgClient } from "@/db/index";

interface GetAppointmentsReportInput {
  orgId: string;
  startDate: string;
  endDate: string;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export async function getAppointmentsReport(input: GetAppointmentsReportInput) {
  const { orgId, startDate, endDate } = input;

  const rows = await pgClient`
    SELECT
      a.id,
      a.status,
      a.start_time,
      a.provider_id,
      u.full_name AS provider_name
    FROM appointments a
    LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE a.organization_id = ${orgId}
      AND a.start_time >= ${startDate}::timestamptz
      AND a.start_time <= ${endDate}::timestamptz
  `;

  const total = rows.length;
  const byStatusMap = new Map<string, number>();
  const byHourMap = new Map<number, number>();
  const byProviderMapWithName = new Map<
    string,
    { name: string; total: number; completed: number; no_show: number }
  >();

  for (let h = 0; h < 24; h++) byHourMap.set(h, 0);

  for (const row of rows) {
    const status = String(row.status ?? "scheduled").toLowerCase();
    byStatusMap.set(status, (byStatusMap.get(status) ?? 0) + 1);

    const start = new Date(row.start_time as string | Date);
    const hour = start.getUTCHours();
    byHourMap.set(hour, (byHourMap.get(hour) ?? 0) + 1);

    const providerId = String(row.provider_id ?? "unknown");
    const name = row.provider_name ? String(row.provider_name) : "Unknown";
    const current = byProviderMapWithName.get(providerId) ?? {
      name,
      total: 0,
      completed: 0,
      no_show: 0,
    };
    current.total += 1;
    if (status === "completed") current.completed += 1;
    if (status === "no_show") current.no_show += 1;
    byProviderMapWithName.set(providerId, current);
  }

  const completed = byStatusMap.get("completed") ?? 0;
  const noShow = byStatusMap.get("no_show") ?? 0;
  const canceled = byStatusMap.get("canceled") ?? 0;

  const by_status = Array.from(byStatusMap.entries()).map(([status, count]) => ({
    status,
    count,
    percentage: total > 0 ? (count / total) * 100 : 0,
  }));

  const by_hour = Array.from(byHourMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, count]) => ({ hour, count }));

  const by_provider = Array.from(byProviderMapWithName.values()).map(
    (data) => ({
      provider_name: data.name,
      total: data.total,
      completed: data.completed,
      completion_rate: safeDivide(data.completed, data.total) * 100,
      no_show: data.no_show,
    })
  );

  return {
    summary: {
      total,
      completion_rate: safeDivide(completed, total) * 100,
      no_show_rate: safeDivide(noShow, total) * 100,
      cancellation_rate: safeDivide(canceled, total) * 100,
    },
    by_status,
    by_hour,
    by_provider,
  };
}
