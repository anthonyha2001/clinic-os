import { pgClient } from "@/db/index";
import { isValidPlanTransition } from "./transitions";

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

  if (tx) {
    return run(tx);
  }

  return pgClient.begin(async (trx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = trx as any;
    return run(runner);
  });
}
