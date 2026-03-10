import { pgClient } from "@/db/index";
import { isValidPlanTransition } from "./transitions";
import { updateAppointmentStatus } from "@/lib/services/appointments/updateStatus";

export interface UpdatePlanStatusInput {
  planId: string;
  orgId: string;
  newStatus: string;
  changedBy: string;
  reason?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any;
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

export async function updatePlanStatus(input: UpdatePlanStatusInput) {
  const { planId, orgId, newStatus, changedBy, reason, tx } = input;

  const sql = tx ?? pgClient;
  const [existing] = await sql`
    SELECT *
    FROM plans
    WHERE id = ${planId}
      AND organization_id = ${orgId}
    LIMIT 1
  `;

  if (!existing) {
    err404("Plan not found");
  }

  const currentStatus = existing.status as string;
  if (!isValidPlanTransition(currentStatus, newStatus)) {
    err422(`Invalid transition: ${currentStatus} → ${newStatus}`);
  }

  const run = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runner: any
  ) => {
    const [updated] = await runner`
      UPDATE plans
      SET
        status = ${newStatus},
        accepted_at = CASE
          WHEN ${newStatus} = 'accepted' THEN now()
          ELSE accepted_at
        END,
        completed_at = CASE
          WHEN ${newStatus} = 'completed' THEN now()
          ELSE completed_at
        END,
        updated_at = now()
      WHERE id = ${planId}
        AND organization_id = ${orgId}
      RETURNING *
    `;

    await runner`
      INSERT INTO plan_status_history (
        plan_id, old_status, new_status, changed_by, reason
      )
      VALUES (
        ${planId},
        ${currentStatus},
        ${newStatus},
        ${changedBy},
        ${reason ?? null}
      )
    `;

    return updated;
  };

  const result = tx
    ? await run(tx)
    : await pgClient.begin(async (trx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const runner = trx as any;
        return run(runner);
      });

  if (newStatus === "canceled") {
    await cancelPlanAppointments(planId, orgId, changedBy, reason ?? "Plan canceled");
  }

  return result;
}

async function cancelPlanAppointments(
  planId: string,
  orgId: string,
  changedBy: string,
  reason: string
) {
  const planItems = await pgClient`
    SELECT id FROM plan_items WHERE plan_id = ${planId}
  `;
  const planItemIds = planItems.map((r) => (r as { id: string }).id);
  if (planItemIds.length === 0) return;

  const toCancel = await pgClient`
    SELECT id, status FROM appointments
    WHERE organization_id = ${orgId}
      AND plan_item_id = ANY(${planItemIds}::uuid[])
      AND status IN ('scheduled', 'confirmed')
  `;

  for (const row of toCancel) {
    const appt = row as { id: string; status: string };
    try {
      await updateAppointmentStatus({
        appointmentId: appt.id,
        newStatus: "canceled",
        changedBy,
        reason,
        orgId,
      });
    } catch (e) {
      console.error(`Failed to cancel appointment ${appt.id} when canceling plan ${planId}:`, e);
    }
  }
}
