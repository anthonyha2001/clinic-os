import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user }) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 50);

  const notifications = await pgClient`
    SELECT
      br.id,
      br.patient_name,
      br.patient_phone,
      br.requested_date,
      br.requested_time,
      br.status,
      br.created_at,
      s.name_en AS service_name,
      u.full_name AS provider_name
    FROM booking_requests br
    LEFT JOIN services s ON s.id = br.service_id
    LEFT JOIN provider_profiles pp ON pp.id = br.provider_id
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE br.organization_id = ${user.organizationId}
    ORDER BY br.created_at DESC
    LIMIT ${limit}
  `;

  const unreadRows = await pgClient`
    SELECT COUNT(*)::int AS count
    FROM booking_requests
    WHERE organization_id = ${user.organizationId}
      AND created_at > now() - interval '24 hours'
      AND status = 'confirmed'
  `;

  return NextResponse.json({
    notifications,
    unread_count: Number(unreadRows[0]?.count ?? 0),
  });
});
