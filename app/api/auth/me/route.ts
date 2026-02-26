import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (_request, { user }) => {
  const [org] = await pgClient`
    SELECT slug FROM organizations WHERE id = ${user.organizationId} LIMIT 1
  `;
  const orgSlug = (org as { slug?: string } | undefined)?.slug ?? null;
  return NextResponse.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    preferredLocale: user.preferredLocale,
    organizationId: user.organizationId,
    organizationSlug: orgSlug,
    roles: user.roles,
    permissions: user.permissions,
  });
});
