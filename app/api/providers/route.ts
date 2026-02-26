import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(
  { roles: ["admin", "manager"] },
  async (_request, { user }) => {
    try {
      const rows = await pgClient`
        SELECT pp.id, pp.specialty_en, pp.specialty_fr, pp.specialty_ar,
               pp.bio_en, pp.bio_fr, pp.bio_ar, pp.color_hex,
               pp.is_accepting_appointments, u.full_name AS name
        FROM provider_profiles pp
        JOIN users u ON u.id = pp.user_id
        WHERE pp.organization_id = ${user.organizationId}
        ORDER BY u.full_name ASC
      `;

      const providers = (rows as unknown as Record<string, unknown>[]).map(
        (r) => ({
          id: r.id,
          name: r.name,
          specialtyEn: r.specialty_en ?? "",
          specialtyFr: r.specialty_fr ?? "",
          specialtyAr: r.specialty_ar ?? "",
          bioEn: r.bio_en ?? "",
          bioFr: r.bio_fr ?? "",
          bioAr: r.bio_ar ?? "",
          colorHex: (r.color_hex as string) ?? "#3B82F6",
          isAcceptingAppointments: Boolean(r.is_accepting_appointments),
        })
      );

      return NextResponse.json(providers, {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
        },
      });
    } catch (e) {
      console.error("GET /api/providers error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
