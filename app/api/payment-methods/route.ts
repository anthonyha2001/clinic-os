import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(
  { roles: ["admin", "manager"] },
  async (_request, { user }) => {
    try {
      const rows = await pgClient`
        SELECT id, type, label_en, label_fr, label_ar, is_active, display_order
        FROM payment_methods
        WHERE organization_id = ${user.organizationId}
        ORDER BY display_order ASC, type ASC
      `;

      const methods = (rows as unknown as Record<string, unknown>[]).map((r) => ({
        id: r.id,
        type: r.type,
        labelEn: r.label_en,
        labelFr: r.label_fr,
        labelAr: r.label_ar,
        isActive: Boolean(r.is_active),
        displayOrder: Number(r.display_order) || 0,
      }));

      return NextResponse.json(methods);
    } catch (e) {
      console.error("GET /api/payment-methods error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
