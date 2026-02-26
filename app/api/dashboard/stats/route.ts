import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

/**
 * Dashboard stats for KPIs. Does not require reports.view so all authenticated users can see the dashboard.
 * Returns real counts from the database.
 */
export const GET = withAuth(async (_request, { user }) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const rows = await pgClient`
      SELECT COUNT(*)::int AS cnt
      FROM patients
      WHERE organization_id = ${user.organizationId}
        AND created_at >= ${startOfMonth.toISOString()}::timestamptz
        AND created_at <= ${endOfDay.toISOString()}::timestamptz
    `;
    const newPatientsThisMonth = Number(rows[0]?.cnt ?? 0);

    return NextResponse.json({
      newPatientsThisMonth,
    });
  } catch (e) {
    console.error("GET /api/dashboard/stats error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
