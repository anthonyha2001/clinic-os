import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { listTags } from "@/lib/services/tags/list";

export const GET = withAuth(async (_request, { user }) => {
  try {
    const tags = await listTags(user.organizationId);
    return NextResponse.json({ tags });
  } catch (e) {
    console.error("GET /api/tags error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
