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
      s.name_en AS service_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN provider_profiles pp ON pp.id = a.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN appointment_lines al ON al.appointment_id = a.id
    LEFT JOIN services s ON s.id = al.service_id
    WHERE a.organization_id = ${input.orgId}
      AND a.start_time >= ${start.toISOString()}
      AND a.start_time < ${end.toISOString()}
    ORDER BY a.start_time ASC
  `;

  const byAppt = new Map<
    string,
    {
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
  >();

  for (const row of rows as unknown as Record<string, unknown>[]) {
    const apptId = String(row.id);
    if (!byAppt.has(apptId)) {
      const firstName = String(row.first_name ?? "");
      const lastName = String(row.last_name ?? "");
      byAppt.set(apptId, {
        id: apptId,
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
      });
    } else {
      const appt = byAppt.get(apptId)!;
      const svc = String(row.service_name ?? "").trim();
      if (svc && !appt.serviceName.includes(svc)) {
        appt.serviceName = appt.serviceName
          ? `${appt.serviceName}, ${svc}`
          : svc;
      }
    }
  }

  return Array.from(byAppt.values());
}
