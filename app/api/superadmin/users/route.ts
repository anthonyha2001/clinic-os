import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgClient } from "@/db/index";
import { createClient } from "@supabase/supabase-js";

function checkAuth() {
  const token = cookies().get("sa_token")?.value;
  if (token !== "sa_authenticated") throw new Error("Unauthorized");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    checkAuth();
    const body = await request.json();
    const { email, full_name, phone, organization_id, role = "staff", password } = body;

    if (!email || !full_name || !organization_id) {
      return NextResponse.json({ error: "email, full_name, organization_id required" }, { status: 422 });
    }

    // Create Supabase auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password ?? Math.random().toString(36).slice(-10) + "A1!",
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message ?? "Failed to create auth user" }, { status: 500 });
    }

    // Insert into public.users
    const [user] = await pgClient`
      INSERT INTO users (id, organization_id, email, full_name, phone, preferred_locale)
      VALUES (${authData.user.id}, ${organization_id}, ${email}, ${full_name}, ${phone ?? null}, 'en')
      RETURNING *
    `;

    // Assign role (required for login - getCurrentUser looks up roles)
    const allRoles = await pgClient`
      SELECT id, name FROM roles WHERE organization_id = ${organization_id}
    `;
    const allRolesArr = allRoles as unknown as { id: string; name: string }[];
    const requestedRole = allRolesArr.find((r) => r.name === role);
    const adminRole = allRolesArr.find((r) => r.name === "admin");
    const anyRole = allRolesArr[0];
    const assignRoleId = requestedRole?.id ?? adminRole?.id ?? anyRole?.id;

    if (assignRoleId) {
      await pgClient`
        INSERT INTO user_roles (user_id, role_id)
        VALUES (${authData.user.id}, ${assignRoleId})
        ON CONFLICT (user_id, role_id) DO NOTHING
      `;
    }

    if (role === "provider" || role === "doctor") {
      await pgClient`
        INSERT INTO provider_profiles (
          user_id, organization_id, is_accepting_appointments
        )
        VALUES (${authData.user.id}, ${organization_id}, true)
        ON CONFLICT (user_id) DO NOTHING
      `;
    }

    // Embed org_id and roles in JWT app_metadata for fast auth
    await supabaseAdmin.auth.admin.updateUserById(authData.user.id, {
      app_metadata: {
        organization_id: organization_id,
        roles: [role],
        permissions: [],
      },
    });

    // Send invite email
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    return NextResponse.json({ user, auth_id: authData.user.id }, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    checkAuth();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("organization_id");

    const users = orgId
      ? await pgClient`
          SELECT u.*, o.name AS org_name
          FROM users u
          JOIN organizations o ON o.id = u.organization_id
          WHERE u.organization_id = ${orgId}
          ORDER BY u.created_at DESC
        `
      : await pgClient`
          SELECT u.*, o.name AS org_name
          FROM users u
          JOIN organizations o ON o.id = u.organization_id
          ORDER BY u.created_at DESC
          LIMIT 200
        `;

    return NextResponse.json(users);
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}