import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { updateAppointmentStatus } from "@/lib/services/appointments/updateStatus";

const checkinSchema = z.object({
  appointment_id: z.string().uuid(),
  notes: z.string().max(500).optional().nullable(),
});

// GET — today's waiting room
export const GET = withAuth(async (request, { user }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const lite = new URL(request.url).searchParams.get("lite") === "1";

  if (lite) {
    const raw = await pgClient`
      SELECT
        ci.id,
        ci.appointment_id,
        ci.status,
        ci.checked_in_at
      FROM appointment_checkins ci
      JOIN appointments a ON a.id = ci.appointment_id
      WHERE ci.organization_id = ${user.organizationId}
        AND a.start_time >= ${today.toISOString()}
        AND a.start_time < ${tomorrow.toISOString()}
      ORDER BY ci.checked_in_at DESC
    `;
    return NextResponse.json(raw);
  }

  const raw = await pgClient`
    SELECT DISTINCT ON (a.id)
      a.id AS appointment_id,
      a.start_time, a.end_time, a.status AS appointment_status,
      a.notes,
      p.id AS patient_id,
      p.first_name, p.last_name, p.phone,
      pp.id AS provider_id,
      u.full_name AS provider_name,
      pp.color_hex AS provider_color,
      (SELECT s2.name_en FROM appointment_lines al2
       JOIN services s2 ON s2.id = al2.service_id
       WHERE al2.appointment_id = a.id
       LIMIT 1) AS service_name,
      ci.id AS checkin_id,
      ci.status AS checkin_status,
      ci.checked_in_at,
      ci.called_in_at
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN provider_profiles pp ON pp.id = a.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN appointment_checkins ci ON ci.appointment_id = a.id
    WHERE a.organization_id = ${user.organizationId}
      AND a.start_time >= ${today.toISOString()}
      AND a.start_time < ${tomorrow.toISOString()}
      AND a.status NOT IN ('canceled','no_show')
    ORDER BY a.id, a.start_time ASC
  `;
  const rows = (raw as Record<string, unknown>[]).sort(
    (a, b) =>
      new Date(a.start_time as string).getTime() -
      new Date(b.start_time as string).getTime()
  );

  return NextResponse.json(rows);
});

// POST — check in a patient
export const POST = withAuth(async (request, { user }) => {
  const body = await request.json();
  const parsed = checkinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 422 }
    );
  }
  const { appointment_id, notes } = parsed.data;

  const [appt] = await pgClient`
    SELECT id, patient_id, status FROM appointments
    WHERE id = ${appointment_id} AND organization_id = ${user.organizationId}
  `;
  if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [checkin] = await pgClient`
    INSERT INTO appointment_checkins (organization_id, appointment_id, patient_id, notes)
    VALUES (${user.organizationId}, ${appointment_id}, ${(appt as { patient_id: string }).patient_id}, ${notes ?? null})
    ON CONFLICT (appointment_id) DO UPDATE
      SET status = 'waiting', checked_in_at = now(), notes = EXCLUDED.notes
    RETURNING id, appointment_id, patient_id, status, checked_in_at
  `;

  const apptFull = appt as { patient_id: string; status: string };
  if (apptFull.status === "scheduled") {
    await updateAppointmentStatus({
      appointmentId: appointment_id,
      newStatus: "confirmed",
      changedBy: user.id,
      reason: "Patient checked in at reception",
      orgId: user.organizationId,
    });
  }

  return NextResponse.json(checkin, { status: 201 });
});
