import { pgClient } from "@/db/index";

export interface ListInvoicesInput {
  orgId: string;
  patientId?: string;
  status?: string | string[];
  startDate?: string;
  endDate?: string;
  providerId?: string;
  limit?: number;
}

export async function listInvoices(input: ListInvoicesInput) {
  const { orgId, patientId, status, startDate, endDate, providerId } = input;
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 1000);
  const statuses = Array.isArray(status)
    ? status.filter(Boolean)
    : status
      ? [status]
      : [];

  return pgClient`
    SELECT
      i.id,
      i.invoice_number,
      i.patient_id,
      i.status,
      i.total,
      i.created_at,
      i.appointment_id,
      p.id AS patient_id_ref,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.phone AS patient_phone,
      pp.id AS provider_id,
      u.full_name AS provider_name,
      COUNT(DISTINCT il.id)::int AS line_count,
      COALESCE(SUM(pa.amount), 0)::numeric(10,2) AS amount_paid,
      (i.total - COALESCE(SUM(pa.amount), 0))::numeric(10,2) AS balance_due
    FROM invoices i
    JOIN patients p ON p.id = i.patient_id
    LEFT JOIN invoice_lines il ON il.invoice_id = i.id
    LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
    LEFT JOIN appointments a ON a.id = i.appointment_id
    LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE i.organization_id = ${orgId}
      AND (${patientId ?? null}::uuid IS NULL OR i.patient_id = ${patientId ?? null}::uuid)
      AND (
        ${statuses.length} = 0
        OR i.status IN ${pgClient(statuses)}
      )
      AND (${startDate ?? null}::timestamptz IS NULL OR i.created_at >= ${startDate ?? null}::timestamptz)
      AND (${endDate ?? null}::timestamptz IS NULL OR i.created_at <= ${endDate ?? null}::timestamptz)
      AND (${providerId ?? null}::uuid IS NULL OR (a.provider_id = ${providerId ?? null}::uuid AND i.appointment_id IS NOT NULL))
    GROUP BY
      i.id,
      p.id,
      p.first_name,
      p.last_name,
      p.phone,
      pp.id,
      u.full_name
    ORDER BY i.created_at DESC
    LIMIT ${limit}
  `;
}
