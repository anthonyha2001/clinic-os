import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10), 1),
      100
    );

    const rows = await pgClient`
      SELECT
        a.id,
        a.action,
        a.entity_type,
        a.entity_id,
        a.details,
        a.created_at,
        u.full_name AS actor_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.organization_id = ${user.organizationId}
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `;

    const logs = (rows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      created_at: r.created_at,
      actor: r.actor_name ? { full_name: r.actor_name } : { full_name: "System" },
      description: formatDescription(
        r.action as string,
        r.entity_type as string,
        r.details
      ),
    }));

    return NextResponse.json({ logs });
  } catch (e) {
    console.error("GET /api/audit-log error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

function formatDescription(
  action: string,
  entityType: string,
  details: unknown
): string {
  const entityLabel = entityType.replace(/_/g, " ");
  const actionLabel = action.replace(/_/g, " ");
  if (details && typeof details === "object" && "message" in details) {
    return (details as { message: string }).message;
  }
  return `${actionLabel} ${entityLabel}`;
}
