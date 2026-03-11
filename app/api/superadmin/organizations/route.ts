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

    // Seed default roles
    const defaultRoles = ["admin", "manager", "provider", "receptionist", "accountant", "staff"];
    for (const roleName of defaultRoles) {
      await pgClient`
        INSERT INTO roles (id, organization_id, name)
        VALUES (gen_random_uuid(), ${org.id}, ${roleName})
        ON CONFLICT (organization_id, name) DO NOTHING
      `;
    }

    // Seed default payment methods
    const defaultPaymentMethods = [
      {
        type: "cash",
        label_en: "Cash",
        label_fr: "Espèces",
        label_ar: "نقداً",
        display_order: 1,
      },
      {
        type: "card",
        label_en: "Credit Card",
        label_fr: "Carte de crédit",
        label_ar: "بطاقة ائتمان",
        display_order: 2,
      },
    ];

    for (const method of defaultPaymentMethods) {
      await pgClient`
        INSERT INTO payment_methods (id, organization_id, type, label_en, label_fr, label_ar, is_active, display_order)
        VALUES (
          gen_random_uuid(),
          ${org.id},
          ${method.type},
          ${method.label_en},
          ${method.label_fr},
          ${method.label_ar},
          true,
          ${method.display_order}
        )
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