import { NextResponse } from "next/server";
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

export async function POST() {
  try {
    checkAuth();

    // Get all users with their org and roles
    const users = await pgClient`
      SELECT 
        u.id, 
        u.organization_id,
        array_agg(r.name) FILTER (WHERE r.name IS NOT NULL) as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      GROUP BY u.id, u.organization_id
    `;

    let fixed = 0;
    for (const u of users) {
      const roles = (u.roles as string[]) ?? [];
      await supabaseAdmin.auth.admin.updateUserById(u.id, {
        app_metadata: {
          organization_id: u.organization_id,
          roles: roles.length > 0 ? roles : ["staff"],
          permissions: [],
        },
      });
      fixed++;
    }

    return NextResponse.json({ ok: true, fixed });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
