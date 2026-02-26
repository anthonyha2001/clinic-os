import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user, params }) => {
  const patientId = params?.patientId as string;

  const [patient] = await pgClient`
    SELECT * FROM patients
    WHERE id = ${patientId} AND organization_id = ${user.organizationId}
  `;
  if (!patient) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [medHistory] = await pgClient`
    SELECT * FROM patient_medical_history
    WHERE patient_id = ${patientId} AND organization_id = ${user.organizationId}
  `;

  const dentalChart = await pgClient`
    SELECT tooth_number, conditions, notes
    FROM dental_chart
    WHERE patient_id = ${patientId} AND organization_id = ${user.organizationId}
    ORDER BY tooth_number ASC
  `;

  const xrays = await pgClient`
    SELECT file_url, file_name, xray_type, tooth_number, taken_at, notes
    FROM dental_xrays
    WHERE patient_id = ${patientId} AND organization_id = ${user.organizationId}
    ORDER BY taken_at DESC
    LIMIT 10
  `;

  const appointments = await pgClient`
    SELECT
      a.start_time, a.status, a.notes,
      s.name_en AS service_name,
      u.full_name AS provider_name
    FROM appointments a
    JOIN provider_profiles pp ON pp.id = a.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN appointment_lines al ON al.appointment_id = a.id
    LEFT JOIN services s ON s.id = al.service_id
    WHERE a.patient_id = ${patientId} AND a.organization_id = ${user.organizationId}
    ORDER BY a.start_time DESC
    LIMIT 20
  `;

  const clinicalNotes = await pgClient`
    SELECT cn.*, u.full_name AS written_by_name
    FROM clinical_notes cn
    LEFT JOIN users u ON u.id = cn.written_by
    WHERE cn.patient_id = ${patientId} AND cn.organization_id = ${user.organizationId}
    ORDER BY cn.note_date DESC
    LIMIT 10
  `;

  return NextResponse.json({
    patient,
    medical_history: medHistory ?? null,
    dental_chart: dentalChart,
    xrays,
    appointments,
    clinical_notes: clinicalNotes,
  });
});