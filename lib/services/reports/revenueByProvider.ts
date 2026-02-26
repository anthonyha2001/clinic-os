import { pgClient } from "@/db/index";

interface GetRevenueByProviderInput {
  orgId: string;
  startDate: string;
  endDate: string;
}

export async function getRevenueByProvider(input: GetRevenueByProviderInput) {
  const { orgId, startDate, endDate } = input;

  const rows = await pgClient`
    SELECT
      a.provider_id,
      COALESCE(u.full_name, 'Unknown provider') AS provider_name,
      COALESCE(SUM(pa.amount), 0)::numeric(10,2) AS total_revenue,
      COUNT(DISTINCT p.id)::int AS payment_count,
      COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END)::int AS appointment_count
    FROM payments p
    JOIN payment_allocations pa ON pa.payment_id = p.id
    JOIN invoices i ON i.id = pa.invoice_id
    JOIN appointments a ON a.id = i.appointment_id
    LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE p.organization_id = ${orgId}
      AND p.created_at >= ${startDate}::timestamptz
      AND p.created_at <= ${endDate}::timestamptz
    GROUP BY a.provider_id, u.full_name
    ORDER BY total_revenue DESC
  `;

  return rows.map((r) => ({
    providerId: String(r.provider_id),
    providerName: String(r.provider_name),
    totalRevenue: Number(r.total_revenue ?? 0),
    paymentCount: Number(r.payment_count ?? 0),
    appointmentCount: Number(r.appointment_count ?? 0),
  }));
}
