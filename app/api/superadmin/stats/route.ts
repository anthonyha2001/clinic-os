import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgClient } from "@/db/index";

function checkAuth() {
  const token = cookies().get("sa_token")?.value;
  if (token !== "sa_authenticated") throw new Error("Unauthorized");
}

export async function GET() {
  try {
    checkAuth();

    const [orgStats] = await pgClient`
      SELECT COUNT(*)::int AS total FROM organizations
    `;
    const [userStats] = await pgClient`
      SELECT COUNT(*)::int AS total FROM users WHERE is_active = true
    `;
    const [apptToday] = await pgClient`
      SELECT COUNT(*)::int AS total FROM appointments
      WHERE start_time::date = CURRENT_DATE
    `;
    const [apptMonth] = await pgClient`
      SELECT COUNT(*)::int AS total FROM appointments
      WHERE start_time >= date_trunc('month', CURRENT_DATE)
    `;
    const [revenueMonth] = await pgClient`
      SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM payments
      WHERE created_at >= date_trunc('month', CURRENT_DATE)
    `;
    const [patientStats] = await pgClient`
      SELECT COUNT(*)::int AS total FROM patients WHERE is_active = true
    `;

    const orgs = await pgClient`
      SELECT
        o.id, o.name, o.slug, o.created_at, o.timezone, o.currency,
        COUNT(DISTINCT u.id)::int AS user_count,
        COUNT(DISTINCT p.id)::int AS patient_count,
        COUNT(DISTINCT a.id) FILTER (WHERE a.start_time::date = CURRENT_DATE)::int AS appts_today,
        COUNT(DISTINCT a.id) FILTER (WHERE a.start_time >= date_trunc('month', CURRENT_DATE))::int AS appts_month,
        COALESCE(SUM(py.amount) FILTER (WHERE py.created_at >= date_trunc('month', CURRENT_DATE)), 0)::numeric AS revenue_month,
        MAX(a.updated_at) AS last_activity
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id AND u.is_active = true
      LEFT JOIN patients p ON p.organization_id = o.id AND p.is_active = true
      LEFT JOIN appointments a ON a.organization_id = o.id
      LEFT JOIN payments py ON py.organization_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;

    return NextResponse.json({
      summary: {
        total_orgs: orgStats.total,
        active_users: userStats.total,
        appts_today: apptToday.total,
        appts_month: apptMonth.total,
        revenue_month: Number(revenueMonth.total),
        total_patients: patientStats.total,
      },
      organizations: orgs,
    });
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}