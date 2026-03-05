import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    try {
      const compact = new URL(request.url).searchParams.get("compact") === "1";
      const rows = await pgClient`
        SELECT
          pp.id,
          pp.color_hex,
          pp.is_accepting_appointments,
          u.full_name AS name
        FROM provider_profiles pp
        JOIN users u ON u.id = pp.user_id
        WHERE pp.organization_id = ${user.organizationId}
        ORDER BY u.full_name ASC
      `;

      const providers = (rows as unknown as Record<string, unknown>[]).map(
        (r) => ({
          id: r.id,
          name: r.name,
          user: { full_name: r.name },
          color_hex: (r.color_hex as string) ?? "#3B82F6",
          colorHex: (r.color_hex as string) ?? "#3B82F6",
          isAcceptingAppointments: Boolean(r.is_accepting_appointments),
        })
      );

      if (compact) {
        return NextResponse.json(
          providers.map((p) => ({
            id: p.id,
            name: p.name,
            user: p.user,
            color_hex: p.color_hex,
            colorHex: p.colorHex,
            isAcceptingAppointments: p.isAcceptingAppointments,
          })),
          {
            headers: {
              "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
            },
          }
        );
      }

      return NextResponse.json(providers, {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
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
