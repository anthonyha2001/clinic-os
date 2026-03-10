import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgClient } from "@/db/index";
import { createClient } from "@supabase/supabase-js";

function checkAuth() {
  const cookieStore = cookies();
  const token = cookieStore.get("sa_token")?.value;
  if (token !== "sa_authenticated") throw new Error("Unauthorized");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    checkAuth();
    const { id } = await params;
    const body = await request.json();
    const { full_name, phone, role, is_active } = body;

    // Update user record
    const [user] = await pgClient`
      UPDATE users SET
        full_name = COALESCE(${full_name ?? null}, full_name),
        phone = COALESCE(${phone ?? null}, phone),
        is_active = COALESCE(${is_active ?? null}, is_active),
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Update role if provided
    if (role) {
      const [roleRow] = await pgClient`
        SELECT id FROM roles 
        WHERE organization_id = ${user.organization_id}
          AND name = ${role}
        LIMIT 1
      `;
      if (roleRow) {
        // Remove existing roles
        await pgClient`DELETE FROM user_roles WHERE user_id = ${id}`;
        // Assign new role
        await pgClient`
          INSERT INTO user_roles (user_id, role_id)
          VALUES (${id}, ${roleRow.id})
        `;
        // Update JWT app_metadata
        await supabaseAdmin.auth.admin.updateUserById(id, {
          app_metadata: {
            organization_id: user.organization_id,
            roles: [role],
            permissions: [],
          },
        });
      }
    }

    // Update active status in Supabase auth
    if (typeof is_active === "boolean") {
      await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: is_active ? "none" : "876600h",
      });
    }

    return NextResponse.json({ ok: true, user });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    checkAuth();
    const { id } = await params;

    // Delete from user_roles first
    await pgClient`DELETE FROM user_roles WHERE user_id = ${id}`;

    // Delete from users table
    await pgClient`DELETE FROM users WHERE id = ${id}`;

    // Delete from Supabase auth
    await supabaseAdmin.auth.admin.deleteUser(id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
