import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    try {
      const rows = await pgClient`
        SELECT id, name_en, name_fr, name_ar, price, default_duration_minutes, is_active
        FROM services
        WHERE organization_id = ${user.organizationId}
        ORDER BY name_en ASC
      `;

      const services = (rows as unknown as Record<string, unknown>[]).map(
        (r) => ({
          id: r.id,
          nameEn: r.name_en,
          nameFr: r.name_fr,
          nameAr: r.name_ar,
          defaultPrice: String(r.price),
          defaultDurationMinutes: Number(r.default_duration_minutes) || 30,
          isActive: Boolean(r.is_active),
        })
      );

      return NextResponse.json(services, {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      });
    } catch (e) {
      console.error("GET /api/services error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

export const POST = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    try {
      const body = await request.json();

      const nameEn = String(body?.name_en ?? "").trim();
      const nameFr = String(body?.name_fr ?? body?.name_en ?? "").trim();
      const nameAr = String(body?.name_ar ?? body?.name_en ?? "").trim();
      const price = parseFloat(body?.default_price ?? 0) || 0;
      const duration = parseInt(String(body?.default_duration_minutes ?? 30), 10) || 30;

      if (!nameEn) {
        return NextResponse.json(
          { error: "name_en is required" },
          { status: 422 }
        );
      }
      if (duration < 5 || duration > 480) {
        return NextResponse.json(
          { error: "default_duration_minutes must be between 5 and 480" },
          { status: 422 }
        );
      }

      const [inserted] = await pgClient`
        INSERT INTO services (
          organization_id, name_en, name_fr, name_ar, price, default_duration_minutes
        )
        VALUES (${user.organizationId}, ${nameEn}, ${nameFr}, ${nameAr}, ${price}, ${duration})
        RETURNING id, name_en, name_fr, name_ar, price, default_duration_minutes, is_active
      `;

      return NextResponse.json(
        {
          id: inserted.id,
          nameEn: inserted.name_en,
          nameFr: inserted.name_fr,
          nameAr: inserted.name_ar,
          defaultPrice: String(inserted.price),
          defaultDurationMinutes: Number(inserted.default_duration_minutes),
          isActive: Boolean(inserted.is_active),
        },
        { status: 201 }
      );
    } catch (e) {
      console.error("POST /api/services error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
