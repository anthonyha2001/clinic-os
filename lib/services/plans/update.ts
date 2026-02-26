import { pgClient } from "@/db/index";

export interface UpdatePlanItemInput {
  service_id: string;
  description_en?: string | null;
  description_fr?: string | null;
  description_ar?: string | null;
  sequence_order: number;
  quantity_total: number;
  unit_price: number;
  notes?: string | null;
}

export interface UpdatePlanInput {
  planId: string;
  orgId: string;
  data: {
    name_en?: string;
    name_fr?: string;
    name_ar?: string;
    notes?: string | null;
    total_estimated_cost?: number | null;
    items?: UpdatePlanItemInput[];
  };
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

export async function updatePlan(input: UpdatePlanInput) {
  const { planId, orgId, data } = input;

  const [existing] = await pgClient`
    SELECT *
    FROM plans
    WHERE id = ${planId}
      AND organization_id = ${orgId}
    LIMIT 1
  `;

  if (!existing) {
    err404("Plan not found");
  }

  if (!["proposed", "accepted"].includes(existing.status as string)) {
    err422("Plan cannot be edited in current status");
  }

  if (data.items !== undefined) {
    if (data.items.length === 0) {
      err422("At least one plan item is required");
    }
    for (const item of data.items) {
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
  }

  return pgClient.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as any;

    const [updated] = await sql`
      UPDATE plans
      SET
        name_en = ${data.name_en ?? existing.name_en},
        name_fr = ${data.name_fr ?? existing.name_fr},
        name_ar = ${data.name_ar ?? existing.name_ar},
        notes = ${data.notes !== undefined ? data.notes : existing.notes},
        total_estimated_cost = ${
          data.total_estimated_cost !== undefined
            ? data.total_estimated_cost
            : existing.total_estimated_cost
        },
        updated_at = now()
      WHERE id = ${planId}
        AND organization_id = ${orgId}
      RETURNING *
    `;

    if (data.items !== undefined) {
      // Full-replace behavior: callers must send the complete desired items array.
      await sql`
        DELETE FROM plan_items
        WHERE plan_id = ${planId}
      `;

      for (const item of data.items) {
        await sql`
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
            ${planId},
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
        `;
      }
    }

    const items = await sql`
      SELECT *
      FROM plan_items
      WHERE plan_id = ${planId}
      ORDER BY sequence_order ASC
    `;

    return {
      ...updated,
      items,
      items_replace_mode: "full_replace",
    };
  });
}
