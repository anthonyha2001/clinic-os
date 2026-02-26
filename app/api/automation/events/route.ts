import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth({ roles: ["admin", "manager"] }, async (request, { user }) => {
  const events = await pgClient`
    SELECT id, event_type, entity_type, status, payload,
           scheduled_for, processed_at, error_message, created_at
    FROM automation_events
    WHERE organization_id = ${user.organizationId}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return NextResponse.json(events);
});