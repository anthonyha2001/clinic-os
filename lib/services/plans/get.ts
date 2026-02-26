import { pgClient } from "@/db/index";

function err404(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 404;
  throw e;
}

export interface GetPlanInput {
  planId: string;
  orgId: string;
}

export interface ListPlansInput {
  orgId: string;
  patientId?: string;
  providerId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export async function getPlan(input: GetPlanInput) {
  const { planId, orgId } = input;

  const [plan] = await pgClient`
    SELECT
      p.*,
      pa.first_name AS patient_first_name,
      pa.last_name AS patient_last_name,
      pa.phone AS patient_phone,
      u.full_name AS provider_name,
      COALESCE(SUM(pi.quantity_completed), 0)::int AS quantity_completed_sum,
      COALESCE(SUM(pi.quantity_total), 0)::int AS quantity_total_sum
    FROM plans p
    JOIN patients pa ON pa.id = p.patient_id
    JOIN provider_profiles pp ON pp.id = p.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN plan_items pi ON pi.plan_id = p.id
    WHERE p.id = ${planId}
      AND p.organization_id = ${orgId}
    GROUP BY p.id, pa.first_name, pa.last_name, pa.phone, u.full_name
    LIMIT 1
  `;

  if (!plan) {
    err404("Plan not found");
  }

  const itemRows = await pgClient`
    SELECT pi.*, s.name_en AS service_name_en
    FROM plan_items pi
    LEFT JOIN services s ON s.id = pi.service_id
    WHERE pi.plan_id = ${planId}
    ORDER BY pi.sequence_order ASC
  `;

  const historyRows = await pgClient`
    SELECT id, old_status, new_status, created_at
    FROM plan_status_history
    WHERE plan_id = ${planId}
    ORDER BY created_at ASC
  `;

  const items = (itemRows as unknown as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    service_id: row.service_id,
    description_en: row.description_en,
    quantity_completed: Number(row.quantity_completed ?? 0),
    quantity_total: Number(row.quantity_total ?? 0),
    unit_price: Number(row.unit_price ?? 0),
    sequence_order: row.sequence_order,
    service: row.service_name_en != null ? { name_en: row.service_name_en } : null,
  }));

  const history = (historyRows as unknown as Record<string, unknown>[]).map((row) => ({
    id: row.id,
    old_status: row.old_status,
    new_status: row.new_status,
    created_at: row.created_at,
  }));

  const totalSessions = items.reduce((s, i) => s + i.quantity_total, 0);
  const completedSessions = items.reduce((s, i) => s + i.quantity_completed, 0);

  return {
    ...plan,
    patient_id: plan.patient_id,
    provider_id: plan.provider_id,
    patient: {
      first_name: plan.patient_first_name,
      last_name: plan.patient_last_name,
      phone: plan.patient_phone,
    },
    provider: { user: { full_name: plan.provider_name } },
    patient_name: `${plan.patient_first_name} ${plan.patient_last_name}`.trim(),
    provider_name: plan.provider_name,
    items,
    history,
    status_history: history,
    total_sessions: totalSessions,
    completed_sessions: completedSessions,
  };
}

export async function listPlans(input: ListPlansInput) {
  const { orgId, patientId, providerId, status, startDate, endDate } = input;

  return pgClient`
    SELECT
      p.*,
      pa.first_name AS patient_first_name,
      pa.last_name AS patient_last_name,
      pa.phone AS patient_phone,
      pp.id AS provider_id_ref,
      u.full_name AS provider_name,
      COUNT(pi.id)::int AS item_count,
      COALESCE(SUM(pi.quantity_completed), 0)::int AS quantity_completed_sum,
      COALESCE(SUM(pi.quantity_total), 0)::int AS quantity_total_sum
    FROM plans p
    JOIN patients pa ON pa.id = p.patient_id
    JOIN provider_profiles pp ON pp.id = p.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN plan_items pi ON pi.plan_id = p.id
    WHERE p.organization_id = ${orgId}
      AND (${patientId ?? null}::uuid IS NULL OR p.patient_id = ${patientId ?? null}::uuid)
      AND (${providerId ?? null}::uuid IS NULL OR p.provider_id = ${providerId ?? null}::uuid)
      AND (${status ?? null}::plan_status IS NULL OR p.status = ${status ?? null}::plan_status)
      AND (${startDate ?? null}::text IS NULL OR p.proposed_at::date >= (${startDate ?? null}::text)::date)
      AND (${endDate ?? null}::text IS NULL OR p.proposed_at::date <= (${endDate ?? null}::text)::date)
    GROUP BY p.id, pa.id, pa.first_name, pa.last_name, pa.phone, pp.id, u.full_name
    ORDER BY p.created_at DESC
  `;
}
