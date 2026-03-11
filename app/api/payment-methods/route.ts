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

export const POST = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    try {
      const body = await request.json();
      const { type, label_en, label_fr, label_ar, display_order, is_active } = body;

      if (!type || !label_en) {
        return NextResponse.json(
          { error: "type and label_en are required" },
          { status: 422 }
        );
      }

      const normalizedType = type.trim().toLowerCase().replace(/\s+/g, "_");

      const [existing] = await pgClient`
        SELECT id FROM payment_methods
        WHERE organization_id = ${user.organizationId} AND type = ${normalizedType}
      `;
      if (existing) {
        return NextResponse.json(
          { error: "A payment method of this type already exists" },
          { status: 409 }
        );
      }

      const [created] = await pgClient`
        INSERT INTO payment_methods (
          id, organization_id, type, label_en, label_fr, label_ar,
          is_active, display_order
        )
        VALUES (
          gen_random_uuid(),
          ${user.organizationId},
          ${normalizedType},
          ${label_en.trim()},
          ${(label_fr ?? "").trim() || label_en.trim()},
          ${(label_ar ?? "").trim() || label_en.trim()},
          ${is_active !== false},
          ${Number(display_order) || 0}
        )
        RETURNING id, type, label_en, label_fr, label_ar, is_active, display_order
      `;

      return NextResponse.json(
        {
          id: created.id,
          type: created.type,
          labelEn: created.label_en,
          labelFr: created.label_fr,
          labelAr: created.label_ar,
          isActive: Boolean(created.is_active),
          displayOrder: Number(created.display_order) || 0,
        },
        { status: 201 }
      );
    } catch (e) {
      console.error("POST /api/payment-methods error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);