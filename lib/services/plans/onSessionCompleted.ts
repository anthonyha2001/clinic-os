import { pgClient } from "@/db/index";
import { updatePlanStatus } from "./updateStatus";

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

export async function onPlanSessionCompleted(
  planItemId: string,
  appointmentId: string
): Promise<{ planItemId: string; newQuantityCompleted: number; planStatus: string }> {
  const [planItem] = await pgClient`
    SELECT id, plan_id, quantity_completed, quantity_total
    FROM plan_items
    WHERE id = ${planItemId}
    LIMIT 1
  `;
  if (!planItem) {
    err404("Plan item not found");
  }

  const [appointment] = await pgClient`
    SELECT id, organization_id, plan_item_id, status, created_by
    FROM appointments
    WHERE id = ${appointmentId}
    LIMIT 1
  `;
  if (!appointment) {
    err404("Appointment not found");
  }
  if (appointment.plan_item_id !== planItemId) {
    err422("Appointment is not linked to this plan item");
  }

  const [plan] = await pgClient`
    SELECT id, organization_id, status
    FROM plans
    WHERE id = ${planItem.plan_id}
    LIMIT 1
  `;
  if (!plan) {
    err404("Plan not found");
  }
  if (!["accepted", "in_progress"].includes(plan.status as string)) {
    err422("Plan is not active");
  }

  return pgClient.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as any;

    // Idempotency: quantity_completed should track completed linked appointments count.
    const [countRow] = await sql`
      SELECT COUNT(*)::int AS completed_count
      FROM appointments
      WHERE plan_item_id = ${planItemId}
        AND status = 'completed'
    `;
    const completedCount = Number(countRow.completed_count ?? 0);

    const [currentItem] = await sql`
      SELECT quantity_completed, quantity_total
      FROM plan_items
      WHERE id = ${planItemId}
      LIMIT 1
    `;
    if (!currentItem) {
      err404("Plan item not found");
    }

    if (Number(currentItem.quantity_completed) >= completedCount) {
      const [currentPlan] = await sql`
        SELECT status
        FROM plans
        WHERE id = ${planItem.plan_id}
        LIMIT 1
      `;
      return {
        planItemId,
        newQuantityCompleted: Number(currentItem.quantity_completed),
        planStatus: String(currentPlan?.status ?? plan.status),
      };
    }

    const [updatedItem] = await sql`
      UPDATE plan_items
      SET
        quantity_completed = quantity_completed + 1,
        updated_at = now()
      WHERE id = ${planItemId}
        AND quantity_completed < quantity_total
      RETURNING quantity_completed, quantity_total
    `;
    if (!updatedItem) {
      err422("Plan item is fully completed");
    }

    let planStatus = String(plan.status);
    if (planStatus === "accepted") {
      const moved = await updatePlanStatus({
        planId: plan.id,
        orgId: plan.organization_id,
        newStatus: "in_progress",
        changedBy: appointment.created_by,
        reason: `Started via appointment ${appointmentId}`,
        tx: sql,
      });
      planStatus = String(moved.status);
    }

    const [remaining] = await sql`
      SELECT COUNT(*)::int AS remaining_count
      FROM plan_items
      WHERE plan_id = ${plan.id}
        AND quantity_completed < quantity_total
    `;
    const remainingCount = Number(remaining.remaining_count ?? 0);

    if (remainingCount === 0 && planStatus === "in_progress") {
      const completedPlan = await updatePlanStatus({
        planId: plan.id,
        orgId: plan.organization_id,
        newStatus: "completed",
        changedBy: appointment.created_by,
        reason: `All plan items completed via appointment ${appointmentId}`,
        tx: sql,
      });
      planStatus = String(completedPlan.status);
    }

    return {
      planItemId,
      newQuantityCompleted: Number(updatedItem.quantity_completed),
      planStatus,
    };
  });
}
