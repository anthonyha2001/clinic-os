import { NextRequest, NextResponse } from "next/server";
import { pgClient } from "@/db/index";

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const providerId = searchParams.get("provider_id");

    if (!date || !providerId) {
      return NextResponse.json({ busy: [] });
    }

    const [org] = await pgClient`
      SELECT id FROM organizations WHERE slug = ${params.slug} LIMIT 1
    `;
    if (!org) return NextResponse.json({ busy: [] });

    const busy = await pgClient`
      SELECT start_time, end_time FROM appointments
      WHERE organization_id = ${org.id}
        AND provider_id = ${providerId}
        AND start_time::date = ${date}::date
        AND status NOT IN ('canceled','no_show')
      ORDER BY start_time ASC
    `;

    return NextResponse.json({
      busy: busy.map(b => ({
        start: new Date(b.start_time).toISOString(),
        end: new Date(b.end_time).toISOString(),
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ busy: [] });
  }
}
