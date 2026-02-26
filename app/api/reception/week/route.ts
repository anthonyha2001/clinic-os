import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("week_start");

  const start = weekStart ? new Date(weekStart) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1); // Monday
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  const rows = await pgClient`
    SELECT
      a.id AS appointment_id,
      a.start_time, a.end_time, a.status AS appointment_status,
      p.id AS patient_id,
      p.first_name, p.last_name, p.phone, p.date_of_birth,
      pp.id AS provider_id,
      u.full_name AS provider_name,
      pp.color_hex AS provider_color,
      pp.specialty_en AS provider_specialty,
      s.name_en AS service_name,
      s.default_duration_minutes AS duration,
      ci.id AS checkin_id,
      ci.status AS checkin_status
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN provider_profiles pp ON pp.id = a.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN appointment_lines al ON al.appointment_id = a.id
    LEFT JOIN services s ON s.id = al.service_id
    LEFT JOIN appointment_checkins ci ON ci.appointment_id = a.id
    WHERE a.organization_id = ${user.organizationId}
      AND a.start_time >= ${start.toISOString()}
      AND a.start_time < ${end.toISOString()}
      AND a.status NOT IN ('canceled','no_show')
    ORDER BY a.start_time ASC
  `;

  return NextResponse.json(rows);
});