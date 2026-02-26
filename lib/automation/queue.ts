import { pgClient } from "@/db/index";
import type { EventType, EntityType, AutomationPayload } from "./types";

export async function queueEvent({
  orgId,
  eventType,
  entityType,
  entityId,
  patientId,
  payload,
  scheduledFor,
}: {
  orgId: string;
  eventType: EventType;
  entityType: EntityType;
  entityId: string;
  patientId?: string;
  payload: AutomationPayload;
  scheduledFor?: Date;
}) {
  const [event] = await pgClient`
    INSERT INTO automation_events (
      organization_id, event_type, entity_type, entity_id,
      patient_id, payload, scheduled_for
    ) VALUES (
      ${orgId}, ${eventType}, ${entityType}, ${entityId},
      ${patientId ?? null}, ${JSON.stringify(payload)},
      ${(scheduledFor ?? new Date()).toISOString()}
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  return event;
}

export async function getPendingEvents(limit = 50) {
  return pgClient`
    SELECT * FROM automation_events
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT ${limit}
  `;
}

export async function markEventStatus(
  id: string,
  status: "completed" | "failed" | "skipped",
  error?: string
) {
  await pgClient`
    UPDATE automation_events
    SET status = ${status},
        processed_at = now(),
        error_message = ${error ?? null}
    WHERE id = ${id}
  `;
}