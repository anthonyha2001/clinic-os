import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pgClient } from "@/db/index";

function checkAuth() {
  const token = cookies().get("sa_token")?.value;
  if (token !== "sa_authenticated") throw new Error("Unauthorized");
}

export async function POST(request: NextRequest) {
  try {
    checkAuth();
    const body = await request.json();
    const { name, slug, timezone = "Asia/Beirut", currency = "USD" } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "name and slug required" }, { status: 422 });
    }

    const [org] = await pgClient`
      INSERT INTO organizations (name, slug, timezone, currency)
      VALUES (${name}, ${slug.toLowerCase().replace(/\s+/g, "-")}, ${timezone}, ${currency})
      RETURNING *
    `;

    // Seed default roles for the new organization
    const defaultRoles = ["admin", "manager", "provider", "receptionist", "accountant", "staff"];
    for (const roleName of defaultRoles) {
      await pgClient`
        INSERT INTO roles (id, organization_id, name)
        VALUES (gen_random_uuid(), ${org.id}, ${roleName})
        ON CONFLICT (organization_id, name) DO NOTHING
      `;
    }

    return NextResponse.json(org, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error;
    if (err.message?.includes("unique")) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}