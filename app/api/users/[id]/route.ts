import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const PATCH = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user, params }) => {
    try {
      const id = params?.id as string | undefined;
      if (!id) {
        return NextResponse.json({ error: "User ID required" }, { status: 400 });
      }

      const body = await request.json();

      const [existing] = await pgClient`
        SELECT id FROM users
        WHERE id = ${id} AND organization_id = ${user.organizationId}
      `;
      if (!existing) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      if (typeof body.is_active === "boolean") {
        await pgClient`
          UPDATE users SET is_active = ${body.is_active}, updated_at = now()
          WHERE id = ${id} AND organization_id = ${user.organizationId}
        `;
      }

      if (Array.isArray(body.roles)) {
        const validRoles = ["admin", "manager", "receptionist", "provider", "accountant"];
        const roleNames = (body.roles as string[]).filter((r) =>
          validRoles.includes(String(r))
        );

        const roleIds = await pgClient`
          SELECT id, name FROM roles
          WHERE organization_id = ${user.organizationId}
            AND name = ANY(${roleNames})
        `;

        await pgClient`
          DELETE FROM user_roles
          WHERE user_id = ${id}
            AND role_id IN (SELECT id FROM roles WHERE organization_id = ${user.organizationId})
        `;

        for (const r of roleIds as unknown as { id: string }[]) {
          await pgClient`
            INSERT INTO user_roles (user_id, role_id, assigned_by)
            VALUES (${id}, ${r.id}, ${user.id})
          `;
        }
      }

      const [updated] = await pgClient`
        SELECT u.id, u.full_name, u.email, u.is_active,
               COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id AND r.organization_id = u.organization_id
        WHERE u.id = ${id} AND u.organization_id = ${user.organizationId}
        GROUP BY u.id
      `;

      if (!updated) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const r = updated as Record<string, unknown>;
      return NextResponse.json({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        isActive: Boolean(r.is_active),
        roles: Array.isArray(r.roles) ? (r.roles as string[]) : [],
      });
    } catch (e) {
      console.error("PATCH /api/users/[id] error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
