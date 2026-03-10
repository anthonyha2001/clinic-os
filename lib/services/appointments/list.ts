import { pgClient } from "@/db/index";

export interface ListAppointmentsInput {
  orgId: string;
  startDate: string; // ISO date or datetime
  endDate: string;
}

export interface ListAppointmentItem {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  patientId: string;
  patientName: string;
  providerId: string;
  providerName: string;
  providerColor: string;
  serviceName: string;
  planItemId: string | null;
}

export async function listAppointments(
  input: ListAppointmentsInput
): Promise<ListAppointmentItem[]> {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);

  const rows = await pgClient`
    SELECT
      a.id,
      a.start_time,
      a.end_time,
      a.status,
      a.patient_id,
      a.plan_item_id,
      p.first_name,
      p.last_name,
      pp.id AS provider_id,
      u.full_name AS provider_name,
      pp.color_hex AS provider_color,
      svc.name_en AS service_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN provider_profiles pp ON pp.id = a.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN LATERAL (
      SELECT s.name_en
      FROM appointment_lines al
      JOIN services s ON s.id = al.service_id
      WHERE al.appointment_id = a.id
      ORDER BY al.sequence_order ASC
      LIMIT 1
    ) svc ON true
    WHERE a.organization_id = ${input.orgId}
      AND a.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND a.start_time >= ${start.toISOString()}
      AND a.start_time < ${end.toISOString()}
    ORDER BY a.start_time ASC
    LIMIT 2000
  `;
  return (rows as unknown as Record<string, unknown>[]).map((row) => {
    const firstName = String(row.first_name ?? "");
    const lastName = String(row.last_name ?? "");
    return {
      id: String(row.id),
      startTime: new Date(row.start_time as Date).toISOString(),
      endTime: new Date(row.end_time as Date).toISOString(),
      status: String(row.status ?? "scheduled"),
      patientId: String(row.patient_id),
      patientName: `${firstName} ${lastName}`.trim() || "Unknown",
      providerId: String(row.provider_id),
      providerName: String(row.provider_name ?? ""),
      providerColor: String(row.provider_color ?? "#3B82F6"),
      serviceName: String(row.service_name ?? ""),
      planItemId: row.plan_item_id ? String(row.plan_item_id) : null,
    };
  });
}
