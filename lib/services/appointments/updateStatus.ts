import { pgClient } from "@/db/index";
import { isValidTransition } from "./transitions";
import { calculateRiskScore } from "@/lib/services/noshow/calculateRisk";

export interface UpdateStatusInput {
  appointmentId: string;
  newStatus: string;
  changedBy: string;
  reason?: string | null;
  orgId: string;
}

export interface AppointmentRow {
  id: string;
  organization_id: string;
  patient_id: string;
  provider_id: string;
  start_time: Date;
  end_time: Date;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
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

export async function updateAppointmentStatus(
  input: UpdateStatusInput
): Promise<AppointmentRow> {
  const { appointmentId, newStatus, changedBy, reason, orgId } = input;

  const [existing] = await pgClient`
    SELECT id, patient_id, provider_id, start_time, end_time, status, notes, created_at, updated_at, organization_id
    FROM appointments
    WHERE id = ${appointmentId} AND organization_id = ${orgId}
  `;

  if (!existing) {
    err404("Appointment not found");
  }

  const currentStatus = (existing as { status: string }).status;
  if (!isValidTransition(currentStatus, newStatus)) {
    err422(
      `Invalid transition: ${currentStatus} → ${newStatus}`
    );
  }

  const result = await pgClient.begin(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql = tx as any;

    const [updated] = await sql`
      UPDATE appointments
      SET status = ${newStatus}, updated_at = now()
      WHERE id = ${appointmentId} AND organization_id = ${orgId}
      RETURNING *
    `;

    await sql`
      INSERT INTO appointment_status_history (
        appointment_id, old_status, new_status, changed_by, reason
      )
      VALUES (
        ${appointmentId},
        ${currentStatus},
        ${newStatus},
        ${changedBy},
        ${reason ?? null}
      )
    `;

    return updated;
  });

  if (newStatus === "no_show") {
    const patientId = (existing as { patient_id: string }).patient_id;
    await calculateRiskScore(patientId, orgId);
  }

  return result as AppointmentRow;
}
