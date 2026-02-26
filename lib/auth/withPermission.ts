import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, type AuthUser } from "./getCurrentUser";
import type { PermissionKey } from "@/db/schema/permissions";

type RouteParams = Record<string, string | string[] | undefined>;

type AuthenticatedHandler = (
  request: NextRequest,
  context: { user: AuthUser; params?: RouteParams }
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a Route Handler to require authentication + specific permission.
 * Returns 401 if not authenticated, 403 if permission denied.
 *
 * Usage:
 *   export const POST = withPermission("invoice.create", async (request, { user }) => {
 *     // Only users with invoice.create permission reach here
 *     return NextResponse.json({ created: true });
 *   });
 */
export function withPermission(
  permission: PermissionKey,
  handler: AuthenticatedHandler
) {
  return async (request: NextRequest, routeContext?: { params?: RouteParams }) => {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!user.permissions.includes(permission)) {
      return NextResponse.json(
        { error: "Forbidden", required: permission },
        { status: 403 }
      );
    }

    return handler(request, {
      user,
      params: routeContext?.params,
    });
  };
}
