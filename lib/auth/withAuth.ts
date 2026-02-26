import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, type AuthUser } from "./getCurrentUser";

type RouteParams = Record<string, string | string[] | undefined>;

type AuthenticatedHandler = (
  request: NextRequest,
  context: { user: AuthUser; params?: RouteParams }
) => Promise<NextResponse> | NextResponse;

interface WithAuthOptions {
  permissions?: string[];
  roles?: string[];
}

/**
 * Wraps a Route Handler to require authentication.
 * Returns 401 if user is not authenticated or inactive.
 *
 * Usage:
 *   export const GET = withAuth(async (request, { user }) => {
 *     return NextResponse.json({ message: `Hello ${user.fullName}` });
 *   });
 */
export function withAuth(handler: AuthenticatedHandler): (
  request: NextRequest,
  routeContext?: { params?: RouteParams }
) => Promise<NextResponse>;
export function withAuth(
  options: WithAuthOptions,
  handler: AuthenticatedHandler
): (
  request: NextRequest,
  routeContext?: { params?: RouteParams }
) => Promise<NextResponse>;
export function withAuth(
  optionsOrHandler: WithAuthOptions | AuthenticatedHandler,
  maybeHandler?: AuthenticatedHandler
) {
  const options: WithAuthOptions =
    typeof optionsOrHandler === "function" ? {} : optionsOrHandler;
  const handler =
    typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;

  if (!handler) {
    throw new Error("withAuth requires a handler");
  }

  return async (request: NextRequest, routeContext?: { params?: RouteParams }) => {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (options.permissions?.length) {
      const isAdminOrManager = ["admin", "manager"].some((r) =>
        user.roles.includes(r)
      );
      const hasAllPermissions =
        isAdminOrManager ||
        options.permissions.every((p) => user.permissions.includes(p));
      if (!hasAllPermissions) {
        return NextResponse.json(
          { error: "Forbidden", required: options.permissions },
          { status: 403 }
        );
      }
    }

    if (options.roles?.length) {
      const hasRole = options.roles.some((r) => user.roles.includes(r));
      if (!hasRole) {
        return NextResponse.json(
          { error: "Forbidden", requiredRoles: options.roles },
          { status: 403 }
        );
      }
    }

    return handler(request, {
      user,
      params: routeContext?.params,
    });
  };
}
