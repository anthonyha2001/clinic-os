import { pgClient } from "@/db/index";
import { auditLog } from "@/lib/services/auditLog";

export interface UpdateAppointmentData {
  start_time?: string;
  end_time?: string;
  provider_id?: string;
  notes?: string | null;
}

export interface UpdateAppointmentInput {
  appointmentId: string;
  orgId: string;
  changedBy: string;
  data: UpdateAppointmentData;
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

function err409(message: string, details?: unknown): never {
  const e = new Error(message) as Error & { statusCode: number; details?: unknown };
  e.statusCode = 409;
  e.details = details;
  throw e;
}

function err422(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 422;
  throw e;
}

export async function updateAppointment(
  input: UpdateAppointmentInput
): Promise<AppointmentRow> {
  const { appointmentId, orgId, data } = input;

  const [existing] = await pgClient`
    SELECT id, patient_id, provider_id, start_time, end_time, status, notes, organization_id
    FROM appointments
    WHERE id = ${appointmentId} AND organization_id = ${orgId}
  `;

  if (!existing) {
    err404("Appointment not found");
  }

  const currentStatus = (existing as { status: string }).status;
  if (!["scheduled", "confirmed"].includes(currentStatus)) {
    err422(`Cannot modify a ${currentStatus} appointment`);
  }

  const ex = existing as {
    provider_id: string;
    start_time: Date;
    end_time: Date;
  };

  const providerId = data.provider_id ?? ex.provider_id;
  const startTime = data.start_time
    ? new Date(data.start_time)
    : new Date(ex.start_time);
  const endTime = data.end_time
    ? new Date(data.end_time)
    : new Date(ex.end_time);

  const timeOrProviderChanging =
    data.start_time != null ||
    data.end_time != null ||
    data.provider_id != null;

  if (timeOrProviderChanging) {
    const startIso = startTime.toISOString();
    const endIso = endTime.toISOString();

    const [overlap] = await pgClient`
      SELECT id, start_time, end_time, provider_id
      FROM appointments
      WHERE organization_id = ${orgId}
        AND provider_id = ${providerId}
        AND id != ${appointmentId}
        AND status NOT IN ('canceled', 'no_show')
        AND tstzrange(start_time, end_time, '[)') && tstzrange(${startIso}::timestamptz, ${endIso}::timestamptz, '[)')
      LIMIT 1
    `;

    if (overlap) {
      err409("Provider has a conflicting appointment", overlap);
    }
  }

  const exFull = existing as {
    start_time: Date;
    end_time: Date;
    provider_id: string;
    notes: string | null;
  };

  const mergedStartTime =
    data.start_time != null ? data.start_time : exFull.start_time;
  const mergedEndTime =
    data.end_time != null ? data.end_time : exFull.end_time;
  const mergedProviderId =
    data.provider_id != null ? data.provider_id : exFull.provider_id;
  const mergedNotes =
    data.notes !== undefined ? data.notes : exFull.notes;

  const hasChanges =
    data.start_time != null ||
    data.end_time != null ||
    data.provider_id != null ||
    data.notes !== undefined;

  if (!hasChanges) {
    const [row] = await pgClient`
      SELECT * FROM appointments WHERE id = ${appointmentId} AND organization_id = ${orgId}
    `;
    return row as unknown as AppointmentRow;
  }

  const [updated] = await pgClient`
    UPDATE appointments
    SET
      start_time = ${mergedStartTime}::timestamptz,
      end_time = ${mergedEndTime}::timestamptz,
      provider_id = ${mergedProviderId}::uuid,
      notes = ${mergedNotes},
      updated_at = now()
    WHERE id = ${appointmentId} AND organization_id = ${orgId}
    RETURNING *
  `;

  const updatedRow = updated as unknown as AppointmentRow;

  await auditLog({
    organizationId: orgId,
    userId: input.changedBy,
    action: "appointment.updated",
    entityType: "appointment",
    entityId: appointmentId,
    details: {
      changes: {
        start_time: data.start_time ?? null,
        end_time: data.end_time ?? null,
        provider_id: data.provider_id ?? null,
        notes: data.notes !== undefined ? data.notes : undefined,
      },
      before: {
        start_time: exFull.start_time,
        end_time: exFull.end_time,
        provider_id: exFull.provider_id,
      },
    },
  });

  return updatedRow;
}
