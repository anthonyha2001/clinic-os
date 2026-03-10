import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

const updateSettingsSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    timezone: z.string().max(100).optional(),
    currency: z.string().length(3).optional(),
    booking_enabled: z.boolean().optional(),
    booking_message: z.string().max(1000).optional().nullable(),
    whatsapp_number: z.string().max(30).optional().nullable(),
    whatsapp_provider: z.enum(["meta", "twilio"]).optional().nullable(),
    whatsapp_api_token: z.string().max(500).optional().nullable(),
    whatsapp_phone_number_id: z.string().max(100).optional().nullable(),
    whatsapp_enabled: z.boolean().optional(),
    clinic_phone: z.string().max(30).optional().nullable(),
    clinic_address: z.string().max(500).optional().nullable(),
    clinic_email: z
      .union([z.string().email().max(255), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    working_hours: z.record(z.string(), z.unknown()).optional().nullable(),
    off_days: z.array(z.string()).optional().nullable(),
  })
  .strict();

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
      const parsed = updateSettingsSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 422 }
        );
      }

      const updates = parsed.data;
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
      }

      const fields = Object.keys(updates);

      if (fields.includes("name")) await pgClient`UPDATE organizations SET name = ${updates.name!} WHERE id = ${user.organizationId}`;
      if (fields.includes("timezone")) await pgClient`UPDATE organizations SET timezone = ${updates.timezone!} WHERE id = ${user.organizationId}`;
      if (fields.includes("currency")) await pgClient`UPDATE organizations SET currency = ${updates.currency!} WHERE id = ${user.organizationId}`;
      if (fields.includes("booking_enabled")) await pgClient`UPDATE organizations SET booking_enabled = ${updates.booking_enabled!} WHERE id = ${user.organizationId}`;
      if (fields.includes("booking_message")) await pgClient`UPDATE organizations SET booking_message = ${updates.booking_message ?? null} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_number")) await pgClient`UPDATE organizations SET whatsapp_number = ${updates.whatsapp_number ?? null} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_provider")) await pgClient`UPDATE organizations SET whatsapp_provider = ${updates.whatsapp_provider ?? null} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_api_token")) await pgClient`UPDATE organizations SET whatsapp_api_token = ${updates.whatsapp_api_token ?? null} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_phone_number_id")) await pgClient`UPDATE organizations SET whatsapp_phone_number_id = ${updates.whatsapp_phone_number_id ?? null} WHERE id = ${user.organizationId}`;
      if (fields.includes("whatsapp_enabled")) await pgClient`UPDATE organizations SET whatsapp_enabled = ${updates.whatsapp_enabled!} WHERE id = ${user.organizationId}`;
      if (fields.includes("clinic_phone")) await pgClient`UPDATE organizations SET clinic_phone = ${updates.clinic_phone ?? null} WHERE id = ${user.organizationId}`;
      if (fields.includes("clinic_address")) await pgClient`UPDATE organizations SET clinic_address = ${updates.clinic_address ?? null} WHERE id = ${user.organizationId}`;
      if (fields.includes("clinic_email")) await pgClient`UPDATE organizations SET clinic_email = ${updates.clinic_email ?? null} WHERE id = ${user.organizationId}`;
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