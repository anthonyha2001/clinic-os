import { cookies, headers } from "next/headers";
import { cache } from "react";
import { jwtDecode } from "jwt-decode";
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

interface ClinicJWT {
  sub: string;
  email?: string;
  exp?: number;
  user_metadata?: {
    full_name?: string;
    name?: string;
    organization_id?: string;
    roles?: string[];
    permissions?: string[];
    preferred_locale?: string;
    phone?: string;
  };
  app_metadata?: {
    organization_id?: string;
    roles?: string[];
    permissions?: string[];
  };
}

async function getAuthToken(): Promise<string> {
  const cookieStore = await cookies();
  const headersList = await headers();
  const authCookie = cookieStore.getAll().find(
    (c) =>
    c.name.includes("auth-token") || c.name === "sb-access-token"
  );
  const tokenFromCookie = extractAccessToken(authCookie?.value ?? "");
  return (
    tokenFromCookie ??
    headersList.get("authorization")?.replace("Bearer ", "") ??
    ""
  );
}

function parseArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function decodeIfEncoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLikelyJwt(value: string): boolean {
  return value.split(".").length === 3;
}

function maybeAccessTokenFromUnknown(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === "string") {
    return isLikelyJwt(data) ? data : null;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const token = maybeAccessTokenFromUnknown(item);
      if (token) return token;
    }
    return null;
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const direct = maybeAccessTokenFromUnknown(obj.access_token);
    if (direct) return direct;
    const session = maybeAccessTokenFromUnknown(obj.currentSession);
    if (session) return session;
    const nestedSession = maybeAccessTokenFromUnknown(obj.session);
    if (nestedSession) return nestedSession;
  }
  return null;
}

function extractAccessToken(rawCookieValue: string): string | null {
  if (!rawCookieValue) return null;
  const decoded = decodeIfEncoded(rawCookieValue);
  if (isLikelyJwt(decoded)) return decoded;
  try {
    const parsed = JSON.parse(decoded) as unknown;
    return maybeAccessTokenFromUnknown(parsed);
  } catch {
    return null;
  }
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
    AND (
      r.organization_id = ${user.organization_id}
      OR r.organization_id IS NULL
    )
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

/**
 * JWT-only session read (no Supabase network call, no DB call).
 */
export async function getCurrentSessionUser(): Promise<AuthUser | null> {
  return getCurrentUserFast();
}

/**
 * Fast path auth: read Supabase access token from cookie and decode claims.
 * This avoids the default supabase.auth.getUser + roles lookup on every request.
 */
export async function getCurrentUserFast(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    const tokenCookie = allCookies.find(
      (c) =>
        c.name.includes("auth-token") ||
        c.name === "sb-access-token" ||
        (c.name.startsWith("sb-") && c.name.endsWith("-auth-token"))
    );
    if (!tokenCookie?.value) return null;

    const rawValue = tokenCookie.value;

    // Handle base64- prefixed Supabase cookie
    let accessToken: string | null = null;

    if (rawValue.startsWith("base64-")) {
      try {
        const base64Part = rawValue.replace("base64-", "");
        const decoded = Buffer.from(base64Part, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded) as Record<string, unknown>;
        accessToken = (parsed.access_token as string) ?? null;
        // Fallback: try token extraction from decoded payload text.
        if (!accessToken) {
          accessToken = extractAccessToken(decoded);
        }
      } catch {
        // Fallback: try raw value without base64 prefix.
        accessToken = extractAccessToken(rawValue.replace("base64-", ""));
      }
    } else {
      accessToken = extractAccessToken(rawValue);
    }

    if (!accessToken) return null;

    const decoded = jwtDecode<{
      sub: string;
      email?: string;
      exp: number;
      app_metadata?: {
        organization_id?: string;
        roles?: string[];
        permissions?: string[];
      };
      user_metadata?: {
        full_name?: string;
        phone?: string;
        preferred_locale?: string;
      };
    }>(accessToken);

    if (!decoded?.sub) return null;
    // 30-second grace to avoid race with token refresh.
    if (decoded.exp * 1000 < Date.now() - 30_000) return null;

    const app = decoded.app_metadata ?? {};
    const meta = decoded.user_metadata ?? {};
    // If org/roles are not embedded yet, fall through to DB lookup path.
    if (!app.organization_id || !app.roles?.length) return null;

    return {
      id: decoded.sub,
      email: decoded.email ?? "",
      fullName: meta.full_name ?? decoded.email ?? "User",
      phone: meta.phone ?? null,
      preferredLocale: meta.preferred_locale ?? "en",
      isActive: true,
      organizationId: app.organization_id,
      roles: app.roles ?? [],
      permissions: app.permissions ?? [],
    };
  } catch {
    return null;
  }
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

    const fastUser = await getCurrentUserFast();
    if (fastUser?.organizationId && fastUser.roles.length > 0) {
      return fastUser;
    }

    const token = await getAuthToken();
    if (!token) return null;
    const decoded = jwtDecode<ClinicJWT>(token);
    if (!decoded?.sub) return null;
    // 30-second grace to avoid race with token refresh.
    if (decoded.exp && decoded.exp * 1000 < Date.now() - 30_000) return null;

    // Fetch custom user record
    const userRows = await pgClient`
      SELECT id, email, full_name, phone, preferred_locale, is_active, organization_id
      FROM users
      WHERE id = ${decoded.sub}
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
      AND (
        r.organization_id = ${user.organization_id}
        OR r.organization_id IS NULL
      )
    `;

    type PermRow = { role_name: string; permission_key: string | null };
    const rows = permRows as unknown as PermRow[];
    const roles = Array.from(new Set(rows.map((r) => r.role_name)));
    const permissions = Array.from(
      new Set(rows.map((r) => r.permission_key).filter((k): k is string => k !== null))
    );

    // If no roles found, try without org filter (handles newly created users)
    let finalRoles = roles;
    let finalPermissions = permissions;

    if (roles.length === 0) {
      const fallbackRows = await pgClient`
        SELECT DISTINCT r.name AS role_name, p.key AS permission_key
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ${user.id}
      `;
      type PermRow = { role_name: string; permission_key: string | null };
      const fallbackPermRows = fallbackRows as unknown as PermRow[];
      finalRoles = Array.from(new Set(fallbackPermRows.map((r) => r.role_name)));
      finalPermissions = Array.from(
        new Set(
          fallbackPermRows
            .map((r) => r.permission_key)
            .filter((k): k is string => k !== null)
        )
      );
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      preferredLocale: user.preferred_locale,
      isActive: user.is_active,
      organizationId: user.organization_id,
      roles: finalRoles,
      permissions: finalPermissions,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("getCurrentUser error:", error instanceof Error ? error.message : "Unknown");
    }
    return null;
  }
}

// Request-scoped dedupe for RSC tree (layout + nested pages).
export const getCurrentUserCached = cache(getCurrentUser);

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
  // Try fast JWT path first.
  const fastUser = await getCurrentUserFast();
  if (fastUser) {
    return { user: fastUser };
  }

  // Try full DB path (handles tokens missing app_metadata).
  const fullUser = await getCurrentUserCached();
  if (fullUser) return { user: fullUser };

  if (process.env.TEST_AUTH_BYPASS === "true") {
    return { redirectTo: "/auth/login" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return { redirectTo: "/auth/login" };
    }

    // Check if user row exists but has no roles (common for new users)
    const userRows = await pgClient`
      SELECT id, is_active FROM users WHERE id = ${authUser.id} LIMIT 1
    `;

    if (userRows.length === 0) {
      // No user row at all — genuine userNotFound
      return { redirectTo: "/auth/error", code: "userNotFound" };
    }

    if (!userRows[0].is_active) {
      // User exists but is deactivated
      return { redirectTo: "/auth/error", code: "userNotFound" };
    }

    // User exists but has no roles or missing app_metadata
    // Build a minimal user and let them through
    const roleRows = await pgClient`
      SELECT DISTINCT r.name AS role_name
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${authUser.id}
    `;

    let roles = (roleRows as unknown as { role_name: string }[]).map((r) => r.role_name);

    // If still no roles found, try without org filter
    let finalRoles = roles;
    if (roles.length === 0) {
      const unfiltered = await pgClient`
        SELECT DISTINCT r.name AS role_name
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ${authUser.id}
      `;
      finalRoles = (unfiltered as unknown as { role_name: string }[]).map((r) => r.role_name);
    }

    // Get full user info
    const fullRows = await pgClient`
      SELECT id, email, full_name, phone, preferred_locale,
             is_active, organization_id
      FROM users WHERE id = ${authUser.id} LIMIT 1
    `;

    if (fullRows.length === 0) {
      return { redirectTo: "/auth/error", code: "userNotFound" };
    }

    const u = fullRows[0] as {
      id: string;
      email: string;
      full_name: string;
      phone: string | null;
      preferred_locale: string;
      is_active: boolean;
      organization_id: string;
    };
    return {
      user: {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        phone: u.phone,
        preferredLocale: u.preferred_locale ?? "en",
        isActive: u.is_active,
        organizationId: u.organization_id,
        roles: finalRoles,
        permissions: [],
      },
    };
  } catch {
    return { redirectTo: "/auth/login" };
  }
}
