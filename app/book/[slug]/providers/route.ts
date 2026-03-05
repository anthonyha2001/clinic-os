import { NextRequest, NextResponse } from "next/server";
import { pgClient } from "@/db/index";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const [org] = await pgClient`
    SELECT id FROM organizations WHERE slug = ${slug} LIMIT 1
  `;
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const providers = await pgClient`
    SELECT pp.id, u.full_name AS name,
           pp.specialty_en AS specialty, pp.color_hex
    FROM provider_profiles pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.organization_id = ${org.id}
      AND pp.is_accepting_appointments = true
    ORDER BY u.full_name ASC
  `;

  return NextResponse.json(providers);
}