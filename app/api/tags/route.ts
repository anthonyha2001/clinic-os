import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { listTags } from "@/lib/services/tags/list";
import { pgClient } from "@/db/index";

const createTagSchema = z.object({
  name_en: z.string().min(1).max(100),
  name_fr: z.string().max(100).optional(),
  name_ar: z.string().max(100).optional(),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

export const GET = withAuth(async (_request, { user }) => {
  try {
    const tags = await listTags(user.organizationId);
    return NextResponse.json({ tags });
  } catch (e) {
    console.error("GET /api/tags error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(
  { roles: ["admin", "manager"] },
  async (request, { user }) => {
    try {
      const body = await request.json();
      const parsed = createTagSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Validation failed", details: parsed.error.issues },
          { status: 422 }
        );
      }

      const nameEn = parsed.data.name_en.trim();
      const nameFr = (parsed.data.name_fr ?? parsed.data.name_en).trim();
      const nameAr = (parsed.data.name_ar ?? parsed.data.name_en).trim();
      const colorHex = parsed.data.color_hex ?? "#6B7280";

      if (!nameEn) {
        return NextResponse.json(
          { error: "Tag name is required" },
          { status: 422 }
        );
      }

      const [existing] = await pgClient`
        SELECT id FROM tags
        WHERE organization_id = ${user.organizationId}
          AND LOWER(name_en) = LOWER(${nameEn})
        LIMIT 1
      `;
      if (existing) {
        return NextResponse.json(
          { error: "A tag with this name already exists" },
          { status: 409 }
        );
      }

      const [tag] = await pgClient`
        INSERT INTO tags (organization_id, name_en, name_fr, name_ar, color_hex, is_active)
        VALUES (${user.organizationId}, ${nameEn}, ${nameFr}, ${nameAr}, ${colorHex}, true)
        RETURNING id, name_en, name_fr, name_ar, color_hex
      `;

      return NextResponse.json(
        {
          id: tag.id,
          nameEn: tag.name_en,
          nameFr: tag.name_fr,
          nameAr: tag.name_ar,
          colorHex: tag.color_hex,
        },
        { status: 201 }
      );
    } catch (e) {
      console.error("POST /api/tags error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
