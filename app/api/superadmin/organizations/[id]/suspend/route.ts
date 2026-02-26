import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgClient } from "@/db/index";

function checkAuth() {
  const token = cookies().get("sa_token")?.value;
  if (token !== "sa_authenticated") throw new Error("Unauthorized");
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    checkAuth();
    const { suspended } = await request.json();

    await pgClient`
      UPDATE users SET is_active = ${!suspended}
      WHERE organization_id = ${params.id}
    `;

    return NextResponse.json({ ok: true, suspended });
  } catch (e) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}