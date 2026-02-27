import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

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

  const response = handleI18nRouting(request);
  if (response.status >= 300 && response.status < 400) {
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
