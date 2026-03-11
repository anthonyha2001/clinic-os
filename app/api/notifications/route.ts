import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

// GET /api/notifications — fetch recent notifications for the current user
export const GET = withAuth(async (request: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit  = Math.min(Number(searchParams.get("limit")  ?? 30), 100);
    const unreadOnly = searchParams.get("unread") === "1";

    const rows = await pgClient`
      SELECT id, type, title, body, link, is_read, created_at
      FROM notifications
      WHERE user_id        = ${user.id}
        AND organization_id = ${user.organizationId}
        ${unreadOnly ? pgClient`AND is_read = false` : pgClient``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const unreadCount = await pgClient`
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE user_id         = ${user.id}
        AND organization_id = ${user.organizationId}
        AND is_read         = false
    `;

    return NextResponse.json({
      notifications: rows,
      unreadCount: Number((unreadCount[0] as { count: number }).count ?? 0),
    });
  } catch (e) {
    console.error("GET /api/notifications error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

// PATCH /api/notifications — mark one or all as read
// Body: { id?: string }  — omit id to mark ALL as read
export const PATCH = withAuth(async (request: NextRequest, { user }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const id   = typeof body?.id === "string" ? body.id : null;

    if (id) {
      await pgClient`
        UPDATE notifications
        SET is_read = true
        WHERE id              = ${id}
          AND user_id         = ${user.id}
          AND organization_id = ${user.organizationId}
      `;
    } else {
      await pgClient`
        UPDATE notifications
        SET is_read = true
        WHERE user_id         = ${user.id}
          AND organization_id = ${user.organizationId}
          AND is_read         = false
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/notifications error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});