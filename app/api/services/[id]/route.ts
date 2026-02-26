import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const PATCH = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user, params }) => {
    try {
      const id = params?.id as string | undefined;
      if (!id) {
        return NextResponse.json({ error: "Service ID required" }, { status: 400 });
      }

      const body = await request.json();

      const [existing] = await pgClient`
        SELECT id, price FROM services
        WHERE id = ${id} AND organization_id = ${user.organizationId}
      `;
      if (!existing) {
        return NextResponse.json({ error: "Service not found" }, { status: 404 });
      }

      const nameEn = typeof body.name_en === "string" ? body.name_en.trim() : undefined;
      const nameFr = typeof body.name_fr === "string" ? body.name_fr.trim() : undefined;
      const nameAr = typeof body.name_ar === "string" ? body.name_ar.trim() : undefined;
      const newPrice = body.default_price !== undefined ? parseFloat(String(body.default_price)) : undefined;
      const duration = body.default_duration_minutes !== undefined
        ? parseInt(String(body.default_duration_minutes), 10)
        : undefined;
      const isActive = typeof body.is_active === "boolean" ? body.is_active : undefined;

      if (nameEn !== undefined && !nameEn) {
        return NextResponse.json({ error: "name_en cannot be empty" }, { status: 422 });
      }
      if (duration !== undefined && (duration < 5 || duration > 480)) {
        return NextResponse.json(
          { error: "default_duration_minutes must be between 5 and 480" },
          { status: 422 }
        );
      }
      if (!nameEn && !nameFr && !nameAr && newPrice === undefined && duration === undefined && isActive === undefined) {
        return NextResponse.json(
          { error: "No valid fields to update" },
          { status: 422 }
        );
      }

      if (newPrice !== undefined && String(existing.price) !== String(newPrice)) {
        await pgClient`
          INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, details)
          VALUES (
            ${user.organizationId},
            ${user.id},
            'service.price_change',
            'service',
            ${id},
            ${JSON.stringify({ old_price: String(existing.price), new_price: String(newPrice) })}
          )
        `;
      }

      const [updated] = await pgClient`
        UPDATE services
        SET
          name_en = COALESCE(${nameEn ?? null}, name_en),
          name_fr = COALESCE(${nameFr ?? null}, name_fr),
          name_ar = COALESCE(${nameAr ?? null}, name_ar),
          price = COALESCE(${newPrice ?? null}, price),
          default_duration_minutes = COALESCE(${duration ?? null}, default_duration_minutes),
          is_active = COALESCE(${isActive ?? null}, is_active),
          updated_at = now()
        WHERE id = ${id} AND organization_id = ${user.organizationId}
        RETURNING id, name_en, name_fr, name_ar, price, default_duration_minutes, is_active
      `;

      if (!updated) {
        return NextResponse.json({ error: "Service not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: updated.id,
        nameEn: updated.name_en,
        nameFr: updated.name_fr,
        nameAr: updated.name_ar,
        defaultPrice: String(updated.price),
        defaultDurationMinutes: Number(updated.default_duration_minutes),
        isActive: Boolean(updated.is_active),
      });
    } catch (e) {
      console.error("PATCH /api/services/[id] error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
