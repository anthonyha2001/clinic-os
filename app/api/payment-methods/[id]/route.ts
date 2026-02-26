import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const PATCH = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user, params }) => {
    try {
      const id = params?.id as string | undefined;
      if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
      }

      const body = await request.json();

      const [existing] = await pgClient`
        SELECT id FROM payment_methods
        WHERE id = ${id} AND organization_id = ${user.organizationId}
      `;
      if (!existing) {
        return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
      }

      const labelEn = typeof body.label_en === "string" ? body.label_en.trim() : undefined;
      const labelFr = typeof body.label_fr === "string" ? body.label_fr.trim() : undefined;
      const labelAr = typeof body.label_ar === "string" ? body.label_ar.trim() : undefined;
      const isActive = typeof body.is_active === "boolean" ? body.is_active : undefined;
      const displayOrder = typeof body.display_order === "number" ? body.display_order : undefined;

      if (!labelEn && !labelFr && !labelAr && isActive === undefined && displayOrder === undefined) {
        return NextResponse.json(
          { error: "No valid fields to update" },
          { status: 422 }
        );
      }

      const [updated] = await pgClient`
        UPDATE payment_methods
        SET
          label_en = COALESCE(${labelEn ?? null}, label_en),
          label_fr = COALESCE(${labelFr ?? null}, label_fr),
          label_ar = COALESCE(${labelAr ?? null}, label_ar),
          is_active = COALESCE(${isActive ?? null}, is_active),
          display_order = COALESCE(${displayOrder ?? null}, display_order)
        WHERE id = ${id} AND organization_id = ${user.organizationId}
        RETURNING id, type, label_en, label_fr, label_ar, is_active, display_order
      `;

      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: updated.id,
        type: updated.type,
        labelEn: updated.label_en,
        labelFr: updated.label_fr,
        labelAr: updated.label_ar,
        isActive: Boolean(updated.is_active),
        displayOrder: Number(updated.display_order),
      });
    } catch (e) {
      console.error("PATCH /api/payment-methods/[id] error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
