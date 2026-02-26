import { pgClient } from "@/db/index";

interface GetRevenueByServiceInput {
  orgId: string;
  startDate: string;
  endDate: string;
}

export async function getRevenueByService(input: GetRevenueByServiceInput) {
  const { orgId, startDate, endDate } = input;

  const rows = await pgClient`
    WITH invoice_line_totals AS (
      SELECT
        il.invoice_id,
        COALESCE(SUM(il.line_total), 0)::numeric(10,2) AS invoice_line_total
      FROM invoice_lines il
      GROUP BY il.invoice_id
    )
    SELECT
      il.service_id,
      s.name_en AS service_name_en,
      s.name_fr AS service_name_fr,
      s.name_ar AS service_name_ar,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(ilt.invoice_line_total, 0) = 0 THEN 0
          ELSE pa.amount * (il.line_total / ilt.invoice_line_total)
        END
      ), 0)::numeric(10,2) AS total_revenue,
      COUNT(il.id)::int AS line_count,
      COALESCE(AVG(il.unit_price), 0)::numeric(10,2) AS average_unit_price
    FROM payments p
    JOIN payment_allocations pa ON pa.payment_id = p.id
    JOIN invoices i ON i.id = pa.invoice_id
    JOIN invoice_lines il ON il.invoice_id = i.id
    LEFT JOIN invoice_line_totals ilt ON ilt.invoice_id = i.id
    LEFT JOIN services s ON s.id = il.service_id
    WHERE p.organization_id = ${orgId}
      AND p.created_at >= ${startDate}::timestamptz
      AND p.created_at <= ${endDate}::timestamptz
      AND il.service_id IS NOT NULL
    GROUP BY il.service_id, s.name_en, s.name_fr, s.name_ar
    ORDER BY total_revenue DESC
  `;

  return rows.map((r) => ({
    serviceId: String(r.service_id),
    serviceNameEn: String(r.service_name_en ?? ""),
    serviceNameFr: String(r.service_name_fr ?? ""),
    serviceNameAr: String(r.service_name_ar ?? ""),
    totalRevenue: Number(r.total_revenue ?? 0),
    lineCount: Number(r.line_count ?? 0),
    averageUnitPrice: Number(r.average_unit_price ?? 0),
  }));
}
