import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);
const PUBLIC_PREFIXES = ["/auth", "/book", "/superadmin"] as const;

function getLocaleFromPathname(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0];
  return first && routing.locales.includes(first as (typeof routing.locales)[number])
    ? first
    : null;
}

function stripLocalePrefix(pathname: string): string {
  const locale = getLocaleFromPathname(pathname);
  if (!locale) return pathname;
  const nextPath = pathname.replace(`/${locale}`, "");
  return nextPath.length ? nextPath : "/";
}

function isPublicPath(pathname: string): boolean {
  const normalizedPath = stripLocalePrefix(pathname);
  return PUBLIC_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );
}

function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.includes("auth-token") ||
        cookie.name === "sb-access-token" ||
        cookie.name === "sb-refresh-token"
    );
}

// Refresh Supabase session on every request
async function refreshSupabaseSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // This triggers token refresh if needed and updates cookies
  await supabase.auth.getUser();
  return response;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip API routes entirely
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Skip i18n routing for public booking and superadmin (no locale prefix)
  if (pathname.startsWith("/book") || pathname.startsWith("/superadmin")) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!isPublicPath(pathname) && !hasSessionCookie(request)) {
    const locale = getLocaleFromPathname(pathname);
    const loginPath =
      locale && locale !== routing.defaultLocale
        ? `/${locale}/auth/login`
        : "/auth/login";
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  // For authenticated requests: refresh session cookies, then let i18n handle routing
  if (!isPublicPath(pathname) && hasSessionCookie(request)) {
    // Refresh the session (updates cookie if token was refreshed)
    await refreshSupabaseSession(request);
    // Always defer to i18n routing (handles / → /en redirect etc.)
    return handleI18nRouting(request);
  }

  // Public paths — just i18n routing
  return handleI18nRouting(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|book|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
