import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const [org] = await pgClient`
      SELECT
        id, name, slug, timezone, currency,
        booking_enabled, booking_message,
        whatsapp_number, whatsapp_provider,
        whatsapp_phone_number_id,
        whatsapp_enabled,
        clinic_phone, clinic_address, clinic_email, logo_url,
        working_hours, off_days
      FROM organizations
      WHERE id = ${user.organizationId}
      LIMIT 1
    `;
    if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(org, {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    console.error("GET /api/settings error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

export const PATCH = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    try {
      const body = await request.json();

      const allowed = [
        "name", "timezone", "currency",
        "booking_enabled", "booking_message",
        "whatsapp_number", "whatsapp_provider",
        "whatsapp_api_token", "whatsapp_phone_number_id",
        "whatsapp_enabled",
        "clinic_phone", "clinic_address", "clinic_email",
        "working_hours", "off_days",
      ] as const;

      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in body) updates[key] = body[key] ?? null;
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
      }

      const fields = Object.keys(updates);

      if (fields.includes("name")) await pgClient`UPDATE organizations SET name = ${updates.name as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("timezone")) await pgClient`UPDATE organizations SET timezone = ${updates.timezone as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("currency")) await pgClient`UPDATE organizations SET currency = ${updates.currency as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("booking_enabled")) await pgClient`UPDATE organizations SET booking_enabled = ${updates.booking_enabled as boolean} WHERE id = ${user.organizationId}`;
      if (fields.includes("booking_message")) await pgClient`UPDATE organizations SET booking_message = ${updates.booking_message as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_number")) await pgClient`UPDATE organizations SET whatsapp_number = ${updates.whatsapp_number as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_provider")) await pgClient`UPDATE organizations SET whatsapp_provider = ${updates.whatsapp_provider as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_api_token")) await pgClient`UPDATE organizations SET whatsapp_api_token = ${updates.whatsapp_api_token as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_phone_number_id")) await pgClient`UPDATE organizations SET whatsapp_phone_number_id = ${updates.whatsapp_phone_number_id as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_enabled")) await pgClient`UPDATE organizations SET whatsapp_enabled = ${updates.whatsapp_enabled as boolean} WHERE id = ${user.organizationId}`;
      if (fields.includes("clinic_phone")) await pgClient`UPDATE organizations SET clinic_phone = ${updates.clinic_phone as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("clinic_address")) await pgClient`UPDATE organizations SET clinic_address = ${updates.clinic_address as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("clinic_email")) await pgClient`UPDATE organizations SET clinic_email = ${updates.clinic_email as string} WHERE id = ${user.organizationId}`;
      if (fields.includes("working_hours")) await pgClient`UPDATE organizations SET working_hours = ${JSON.stringify(updates.working_hours)}::jsonb WHERE id = ${user.organizationId}`;
      if (fields.includes("off_days")) await pgClient`UPDATE organizations SET off_days = ${JSON.stringify(updates.off_days)}::jsonb WHERE id = ${user.organizationId}`;

      await pgClient`UPDATE organizations SET updated_at = now() WHERE id = ${user.organizationId}`;

      const [updated] = await pgClient`
        SELECT id, name, slug, timezone, currency,
          booking_enabled, booking_message,
          whatsapp_number, whatsapp_provider, whatsapp_phone_number_id,
          whatsapp_enabled, clinic_phone, clinic_address, clinic_email,
          working_hours, off_days
        FROM organizations WHERE id = ${user.organizationId}
      `;

      return NextResponse.json(updated);
    } catch (e) {
      console.error("PATCH /api/settings error:", e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }
);