import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { randomUUID } from "crypto";

const createUserSchema = z.object({
  email: z.string().email().max(255).transform((v) => v.trim().toLowerCase()),
  full_name: z.string().min(1).max(255).transform((v) => v.trim()),
  role: z
    .enum(["admin", "manager", "receptionist", "provider", "accountant"])
    .default("receptionist"),
});

export const GET = withAuth(
  { roles: ["admin", "manager"] },
  async (_request, { user }) => {
    try {
      const rows = await pgClient`
        SELECT u.id, u.full_name, u.email, u.is_active,
               COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id AND r.organization_id = u.organization_id
        WHERE u.organization_id = ${user.organizationId}
        GROUP BY u.id, u.full_name, u.email, u.is_active
        ORDER BY u.full_name ASC
      `;

      const users = (rows as unknown as Record<string, unknown>[]).map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        isActive: Boolean(r.is_active),
        roles: Array.isArray(r.roles) ? (r.roles as string[]) : [],
      }));

      return NextResponse.json(users);
    } catch (e) {
      console.error("GET /api/users error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

export const POST = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    try {
      const body = await request.json();
      const parsed = createUserSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 422 }
        );
      }
      const { email, full_name: fullName, role: roleName } = parsed.data;

      const [existing] = await pgClient`
        SELECT id FROM users
        WHERE organization_id = ${user.organizationId} AND email = ${email}
      `;
      if (existing) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 }
        );
      }

      const [role] = await pgClient`
        SELECT id FROM roles
        WHERE organization_id = ${user.organizationId} AND name = ${roleName}
      `;
      if (!role) {
        return NextResponse.json(
          { error: "Role not found in organization" },
          { status: 404 }
        );
      }

      const newId = randomUUID();

      await pgClient`
        INSERT INTO users (id, organization_id, email, full_name)
        VALUES (${newId}, ${user.organizationId}, ${email}, ${fullName})
      `;

      await pgClient`
        INSERT INTO user_roles (user_id, role_id, assigned_by)
        VALUES (${newId}, ${role.id}, ${user.id})
      `;

      // Auto-create a provider_profiles row so the user appears in the
      // Providers settings page immediately after creation.
      if (roleName === "provider") {
        await pgClient`
          INSERT INTO provider_profiles (id, organization_id, user_id, is_accepting_appointments)
          VALUES (gen_random_uuid(), ${user.organizationId}, ${newId}, true)
          ON CONFLICT (user_id) DO NOTHING
        `;
      }

      const [created] = await pgClient`
        SELECT id, full_name, email, is_active
        FROM users WHERE id = ${newId}
      `;

      return NextResponse.json(
        {
          id: created.id,
          fullName: created.full_name,
          email: created.email,
          isActive: Boolean(created.is_active),
          roles: [roleName],
        },
        { status: 201 }
      );
    } catch (e) {
      console.error("POST /api/users error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);