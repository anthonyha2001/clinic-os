import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (req, { user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const limitDays = Number(searchParams.get("limit_days") ?? 30);

    const rows = await pgClient`
      WITH last_service_visit AS (
        SELECT DISTINCT ON (a.patient_id, al.service_id)
          a.patient_id,
          al.service_id,
          a.start_time          AS last_visit,
          a.organization_id
        FROM appointments a
        JOIN appointment_lines al ON al.appointment_id = a.id
        WHERE a.organization_id = ${user.organizationId}
          AND a.status = 'completed'
          AND a.deleted_at IS NULL
        ORDER BY a.patient_id, al.service_id, a.start_time DESC
      )
      SELECT
        lsv.patient_id,
        pt.first_name || ' ' || pt.last_name   AS patient_name,
        pt.phone                                AS patient_phone,
        s.id                                    AS service_id,
        s.name_en                               AS service_name,
        s.recall_interval_days,
        lsv.last_visit,
        (lsv.last_visit::date + (s.recall_interval_days || ' days')::interval)::date
                                                AS due_date,
        CURRENT_DATE - (lsv.last_visit::date + (s.recall_interval_days || ' days')::interval)::date
                                                AS days_overdue
      FROM last_service_visit lsv
      JOIN patients  pt ON pt.id = lsv.patient_id
      JOIN services  s  ON s.id  = lsv.service_id
      WHERE s.recall_interval_days IS NOT NULL
        AND s.is_active = true
        AND pt.deleted_at IS NULL
        AND (lsv.last_visit::date + (s.recall_interval_days || ' days')::interval)::date
              <= CURRENT_DATE + ${limitDays}::integer
      ORDER BY due_date ASC
    `;

    const overdue = rows.filter((r) => Number(r.days_overdue) > 0);
    const upcoming = rows.filter((r) => Number(r.days_overdue) <= 0);

    return NextResponse.json({
      overdue: overdue.map(formatRow),
      upcoming: upcoming.map(formatRow),
      summary: {
        total_overdue: overdue.length,
        total_upcoming: upcoming.length,
        limit_days: limitDays,
      },
    });
  } catch (e) {
    console.error("GET /api/reports/recall-due error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

function formatRow(r: Record<string, unknown>) {
  return {
    patient_id:           r.patient_id as string,
    patient_name:         r.patient_name as string,
    patient_phone:        r.patient_phone as string,
    service_id:           r.service_id as string,
    service_name:         r.service_name as string,
    recall_interval_days: Number(r.recall_interval_days),
    last_visit:           r.last_visit as string,
    due_date:             r.due_date as string,
    days_overdue:         Number(r.days_overdue),
  };
}