import { NextRequest, NextResponse } from "next/server";
import { pgClient } from "@/db/index";

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const [org] = await pgClient`
    SELECT id FROM organizations WHERE slug = ${params.slug} LIMIT 1
  `;
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const services = await pgClient`
    SELECT id, name_en AS name, price, default_duration_minutes AS duration
    FROM services
    WHERE organization_id = ${org.id}
      AND is_active = true
    ORDER BY name_en ASC
  `;

  return NextResponse.json(services);
}