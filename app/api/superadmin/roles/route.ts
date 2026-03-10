import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgClient } from "@/db/index";

function checkAuth() {
  const token = cookies().get("sa_token")?.value;
  if (token !== "sa_authenticated") throw new Error("Unauthorized");
}

export async function GET(request: NextRequest) {
  try {
    checkAuth();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("organization_id");
    if (!orgId) {
      return NextResponse.json({ error: "organization_id required" }, { status: 422 });
    }
    const roles = await pgClient`
      SELECT id, name FROM roles
      WHERE organization_id = ${orgId}
      ORDER BY name ASC
    `;
    return NextResponse.json(roles);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
