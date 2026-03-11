import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const PATCH = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user, params }) => {
    try {
      const id = params?.id as string | undefined;
      if (!id) {
        return NextResponse.json(
          { error: "Provider ID required" },
          { status: 400 }
        );
      }

      const body = await request.json();

      const [existing] = await pgClient`
        SELECT id FROM provider_profiles
        WHERE id = ${id} AND organization_id = ${user.organizationId}
      `;
      if (!existing) {
        return NextResponse.json({ error: "Provider not found" }, { status: 404 });
      }

      const specialtyEn = typeof body.specialty_en === "string" ? body.specialty_en.trim() : undefined;
      const specialtyFr = typeof body.specialty_fr === "string" ? body.specialty_fr.trim() : undefined;
      const specialtyAr = typeof body.specialty_ar === "string" ? body.specialty_ar.trim() : undefined;
      const bioEn = typeof body.bio_en === "string" ? body.bio_en : undefined;
      const bioFr = typeof body.bio_fr === "string" ? body.bio_fr : undefined;
      const bioAr = typeof body.bio_ar === "string" ? body.bio_ar : undefined;
      const colorHex = typeof body.color_hex === "string" && /^#[0-9A-Fa-f]{6}$/.test(body.color_hex)
        ? body.color_hex
        : undefined;
      const isAcceptingAppointments =
        typeof body.is_accepting_appointments === "boolean"
          ? body.is_accepting_appointments
          : undefined;

      const [updated] = await pgClient`
        UPDATE provider_profiles
        SET
          specialty_en = COALESCE(${specialtyEn ?? null}, specialty_en),
          specialty_fr = COALESCE(${specialtyFr ?? null}, specialty_fr),
          specialty_ar = COALESCE(${specialtyAr ?? null}, specialty_ar),
          bio_en = COALESCE(${bioEn ?? null}, bio_en),
          bio_fr = COALESCE(${bioFr ?? null}, bio_fr),
          bio_ar = COALESCE(${bioAr ?? null}, bio_ar),
          color_hex = COALESCE(${colorHex ?? null}, color_hex),
          is_accepting_appointments = COALESCE(${isAcceptingAppointments ?? null}, is_accepting_appointments),
          updated_at = now()
        WHERE id = ${id} AND organization_id = ${user.organizationId}
        RETURNING id, specialty_en, specialty_fr, specialty_ar, bio_en, bio_fr, bio_ar, color_hex, is_accepting_appointments
      `;

      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const [withName] = await pgClient`
        SELECT pp.*, u.full_name AS name
        FROM provider_profiles pp
        JOIN users u ON u.id = pp.user_id
        WHERE pp.id = ${id}
      `;

      const r = (withName ?? updated) as Record<string, unknown>;
      return NextResponse.json({
        id: r.id,
        name: r.name ?? "",
        specialtyEn: r.specialty_en ?? "",
        specialtyFr: r.specialty_fr ?? "",
        specialtyAr: r.specialty_ar ?? "",
        bioEn: r.bio_en ?? "",
        bioFr: r.bio_fr ?? "",
        bioAr: r.bio_ar ?? "",
        colorHex: (r.color_hex as string) ?? "#3B82F6",
        isAcceptingAppointments: Boolean(r.is_accepting_appointments),
      });
    } catch (e) {
      console.error("PATCH /api/providers/[id] error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
export const DELETE = withAuth(
  { roles: ["admin"] },
  async (_request, { user, params }) => {
    try {
      const id = params?.id as string | undefined;
      if (!id) {
        return NextResponse.json({ error: "Provider ID required" }, { status: 400 });
      }

      const [provider] = await pgClient`
        SELECT pp.id, pp.user_id
        FROM provider_profiles pp
        WHERE pp.id = ${id}
          AND pp.organization_id = ${user.organizationId}
      `;
      if (!provider) {
        return NextResponse.json({ error: "Provider not found" }, { status: 404 });
      }

      // Block if provider has upcoming appointments
      const [futureAppt] = await pgClient`
        SELECT id FROM appointments
        WHERE provider_id = ${id}
          AND organization_id = ${user.organizationId}
          AND status IN ('scheduled', 'confirmed')
          AND start_time > now()
        LIMIT 1
      `;
      if (futureAppt) {
        return NextResponse.json(
          { error: "Cannot delete provider with upcoming appointments. Reassign or cancel them first." },
          { status: 409 }
        );
      }

      // Prevent self-deletion
      if (provider.user_id === user.id) {
        return NextResponse.json({ error: "You cannot delete your own account." }, { status: 403 });
      }

      await pgClient`
        UPDATE users SET is_active = false, updated_at = now()
        WHERE id = ${provider.user_id}
          AND organization_id = ${user.organizationId}
      `;

      await pgClient`
        DELETE FROM provider_profiles
        WHERE id = ${id} AND organization_id = ${user.organizationId}
      `;

      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/providers/[id] error:", e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }
);