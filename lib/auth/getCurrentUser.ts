import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pgClient } from "@/db/index";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  preferredLocale: string;
  isActive: boolean;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

const authCache = new Map<string, { user: AuthUser; expires: number }>();

function getCachedUser(token: string): AuthUser | null {
  const cached = authCache.get(token);
  if (!cached) return null;
  if (Date.now() > cached.expires) {
    authCache.delete(token);
    return null;
  }
  return cached.user;
}

function setCachedUser(token: string, user: AuthUser) {
  authCache.set(token, { user, expires: Date.now() + 30_000 });
  if (authCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of authCache.entries()) {
      if (now > v.expires) authCache.delete(k);
    }
  }
}

async function getAuthToken(): Promise<string> {
  const cookieStore = await cookies();
  const headersList = await headers();
  const authCookie = cookieStore.getAll().find((c) =>
    c.name.includes("auth-token") || c.name === "sb-access-token"
  );
  return (
    authCookie?.value ??
    headersList.get("authorization")?.replace("Bearer ", "") ??
    ""
  );
}

/**
 * Get the current authenticated user with roles and permissions.
 * Returns null if not authenticated or user record not found.
 *
 * Usage in Route Handlers:
 *   const user = await getCurrentUser();
 *   if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *
 * Usage in Server Components:
 *   const user = await getCurrentUser();
 *   if (!user) redirect("/login");
 */
async function getTestUser(userId: string): Promise<AuthUser | null> {
  const userRows = await pgClient`
    SELECT id, email, full_name, phone, preferred_locale, is_active, organization_id
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;
  if (userRows.length === 0 || !userRows[0].is_active) return null;
  const user = userRows[0];

  const permRows = await pgClient`
    SELECT DISTINCT r.name AS role_name, p.key AS permission_key
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = ${user.id}
    AND r.organization_id = ${user.organization_id}
  `;

  type PermRow = { role_name: string; permission_key: string | null };
  const rows = permRows as unknown as PermRow[];
  const roles = Array.from(new Set(rows.map((r) => r.role_name)));
  const permissions = Array.from(
    new Set(rows.map((r) => r.permission_key).filter((k): k is string => k !== null))
  );

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    preferredLocale: user.preferred_locale,
    isActive: user.is_active,
    organizationId: user.organization_id,
    roles,
    permissions,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    // Test bypass: when TEST_AUTH_BYPASS=true, use X-Test-User-Id header to authenticate
    if (process.env.TEST_AUTH_BYPASS === "true") {
      const headersList = await headers();
      const testUserId = headersList.get("x-test-user-id");
      if (testUserId) {
        return getTestUser(testUserId);
      }
    }

    const token = await getAuthToken();
    const cached = getCachedUser(token);
    if (cached) return cached;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) return null;

    // Fetch custom user record
    const userRows = await pgClient`
      SELECT id, email, full_name, phone, preferred_locale, is_active, organization_id
      FROM users
      WHERE id = ${authUser.id}
      LIMIT 1
    `;

    if (userRows.length === 0) return null;
    const user = userRows[0];

    // Inactive users are rejected
    if (!user.is_active) return null;

    // Fetch roles and permissions in one query
    const permRows = await pgClient`
      SELECT DISTINCT r.name AS role_name, p.key AS permission_key
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ${user.id}
      AND r.organization_id = ${user.organization_id}
    `;

    type PermRow = { role_name: string; permission_key: string | null };
    const rows = permRows as unknown as PermRow[];
    const roles = Array.from(new Set(rows.map((r) => r.role_name)));
    const permissions = Array.from(
      new Set(rows.map((r) => r.permission_key).filter((k): k is string => k !== null))
    );

    const authUserResult: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      preferredLocale: user.preferred_locale,
      isActive: user.is_active,
      organizationId: user.organization_id,
      roles,
      permissions,
    };

    setCachedUser(token, authUserResult);
    return authUserResult;
  } catch (error) {
    console.error("getCurrentUser error:", error);
    return null;
  }
}

/**
 * For layout: returns user or redirect info.
 * When Supabase session exists but custom user is missing → redirect to /auth/error?code=userNotFound
 * (that route signs out and redirects to login with error).
 */
export async function getUserOrRedirectInfo(): Promise<
  | { user: AuthUser }
  | { redirectTo: "/auth/login" }
  | { redirectTo: "/auth/error"; code: "userNotFound" }
> {
  const user = await getCurrentUser();
  if (user) return { user };

  if (process.env.TEST_AUTH_BYPASS === "true") {
    return { redirectTo: "/auth/login" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (authUser) {
    return { redirectTo: "/auth/error", code: "userNotFound" };
  }
  return { redirectTo: "/auth/login" };
}
