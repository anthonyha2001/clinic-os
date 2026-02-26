import { NextRequest, NextResponse } from "next/server";
import { pgClient } from "@/db/index";

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const [org] = await pgClient`
      SELECT id FROM organizations WHERE slug = ${params.slug} LIMIT 1
    `;
    if (!org) return NextResponse.json([], { status: 200 });

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
  } catch (e) {
    console.error(e);
    return NextResponse.json([], { status: 200 });
  }
}
