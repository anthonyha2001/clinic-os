import { pgClient } from "@/db/index";

export interface CreatePlanItemInput {
  service_id: string | null;
  description_en?: string | null;
  description_fr?: string | null;
  description_ar?: string | null;
  sequence_order: number;
  quantity_total: number;
  unit_price: number;
  notes?: string | null;
}

export interface CreatePlanInput {
  orgId: string;
  patientId: string;
  providerId: string;
  createdBy: string;
  name_en: string;
  name_fr: string;
  name_ar: string;
  notes?: string | null;
  totalEstimatedCost?: number | null;
  items: CreatePlanItemInput[];
}

function err404(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 404;
  throw e;
}

function err422(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 422;
  throw e;
}

export async function createPlan(input: CreatePlanInput) {
  const {
    orgId,
    patientId,
    providerId,
    createdBy,
    name_en,
    name_fr,
    name_ar,
    notes,
    totalEstimatedCost,
    items,
  } = input;

  if (!items || items.length === 0) {
    err422("At least one plan item is required");
  }

  const [patient] = await pgClient`
    SELECT id
    FROM patients
    WHERE id = ${patientId}
      AND organization_id = ${orgId}
    LIMIT 1
  `;
  if (!patient) {
    err404("Patient not found");
  }

  const [provider] = await pgClient`
    SELECT id
    FROM provider_profiles
    WHERE id = ${providerId}
      AND organization_id = ${orgId}
    LIMIT 1
  `;
  if (!provider) {
    err404("Provider not found");
  }

  for (const item of items) {
    if (item.service_id == null || item.service_id === "") continue;
    const [service] = await pgClient`
      SELECT id
      FROM services
      WHERE id = ${item.service_id}
        AND organization_id = ${orgId}
        AND is_active = true
      LIMIT 1
    `;
    if (!service) {
      err404("Service not found or inactive");
    }
  }

  return pgClient.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as any;

    const [plan] = await sql`
      INSERT INTO plans (
        organization_id,
        patient_id,
        provider_id,
        name_en,
        name_fr,
        name_ar,
        status,
        total_estimated_cost,
        notes,
        proposed_at,
        created_by
      )
      VALUES (
        ${orgId},
        ${patientId},
        ${providerId},
        ${name_en},
        ${name_fr},
        ${name_ar},
        'proposed',
        ${totalEstimatedCost ?? null},
        ${notes ?? null},
        now(),
        ${createdBy}
      )
      RETURNING *
    `;

    const createdItems: unknown[] = [];
    for (const item of items) {
      const [inserted] = await sql`
        INSERT INTO plan_items (
          plan_id,
          service_id,
          description_en,
          description_fr,
          description_ar,
          sequence_order,
          quantity_total,
          quantity_completed,
          unit_price,
          notes
        )
        VALUES (
          ${plan.id},
          ${item.service_id},
          ${item.description_en ?? null},
          ${item.description_fr ?? null},
          ${item.description_ar ?? null},
          ${item.sequence_order},
          ${item.quantity_total},
          0,
          ${item.unit_price},
          ${item.notes ?? null}
        )
        RETURNING *
      `;
      createdItems.push(inserted);
    }

    await sql`
      INSERT INTO plan_status_history (
        plan_id, old_status, new_status, changed_by, reason
      )
      VALUES (${plan.id}, null, 'proposed', ${createdBy}, null)
    `;

    return {
      ...plan,
      items: createdItems,
    };
  });
}
