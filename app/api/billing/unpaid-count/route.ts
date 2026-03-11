import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user }) => {
  try {
    if (!user?.organizationId) {
      return NextResponse.json({ count: 0, new_from_appointment_count: 0 });
    }

    const { searchParams } = new URL(request.url);
    const lastSeen = searchParams.get("lastSeen");

    const rows = await pgClient`
      SELECT COUNT(*)::int AS count
      FROM invoices
      WHERE organization_id = ${user.organizationId}
        AND status IN ('issued', 'partially_paid')
    `;

    let newFromAppointmentCount = 0;
    if (lastSeen) {
      const iso = lastSeen;
      const newRows = await pgClient`
        SELECT COUNT(*)::int AS count
        FROM invoices
        WHERE organization_id = ${user.organizationId}
          AND appointment_id IS NOT NULL
          AND created_at > ${iso}::timestamptz
      `;
      newFromAppointmentCount = Number(newRows[0]?.count ?? 0);
    }

    return NextResponse.json(
      {
        count: Number(rows[0]?.count ?? 0),
        new_from_appointment_count: newFromAppointmentCount,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    console.error("GET /api/billing/unpaid-count error:", e);
    return NextResponse.json({ count: 0, new_from_appointment_count: 0 });
  }
});