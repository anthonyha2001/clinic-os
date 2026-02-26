import { pgClient } from "@/db/index";

interface GetProvidersReportInput {
  orgId: string;
  startDate: string;
  endDate: string;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export async function getProvidersReport(input: GetProvidersReportInput) {
  const { orgId, startDate, endDate } = input;

  const appointmentRows = await pgClient`
    SELECT
      a.provider_id,
      u.full_name AS provider_name,
      COUNT(*)::int AS total_appointments,
      COUNT(CASE WHEN a.status = 'completed' THEN 1 END)::int AS completed,
      COUNT(CASE WHEN a.status = 'no_show' THEN 1 END)::int AS no_show
    FROM appointments a
    LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE a.organization_id = ${orgId}
      AND a.start_time >= ${startDate}::timestamptz
      AND a.start_time <= ${endDate}::timestamptz
    GROUP BY a.provider_id, u.full_name
  `;

  const revenueRows = await pgClient`
    SELECT
      a.provider_id,
      COALESCE(SUM(pa.amount), 0)::numeric(10,2) AS revenue
    FROM payments p
    JOIN payment_allocations pa ON pa.payment_id = p.id
    JOIN invoices i ON i.id = pa.invoice_id
    JOIN appointments a ON a.id = i.appointment_id
    WHERE p.organization_id = ${orgId}
      AND p.created_at >= ${startDate}::timestamptz
      AND p.created_at <= ${endDate}::timestamptz
    GROUP BY a.provider_id
  `;

  const revenueByProvider = new Map<string, number>();
  for (const r of revenueRows) {
    revenueByProvider.set(String(r.provider_id), Number(r.revenue ?? 0));
  }

  const providers = appointmentRows.map((r) => {
    const totalAppointments = Number(r.total_appointments ?? 0);
    const completed = Number(r.completed ?? 0);
    const noShow = Number(r.no_show ?? 0);
    const revenue = revenueByProvider.get(String(r.provider_id)) ?? 0;
    return {
      provider_name: r.provider_name ? String(r.provider_name) : "Unknown",
      total_appointments: totalAppointments,
      completed,
      completion_rate: safeDivide(completed, totalAppointments) * 100,
      no_show_rate: safeDivide(noShow, totalAppointments) * 100,
      revenue,
      avg_per_appointment:
        totalAppointments > 0 ? revenue / totalAppointments : 0,
    };
  });

  return { providers };
}
