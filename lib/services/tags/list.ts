import { pgClient } from "@/db/index";

export interface TagItem {
  id: string;
  nameEn: string;
  nameFr: string;
  nameAr: string;
  colorHex: string;
}

export async function listTags(orgId: string): Promise<TagItem[]> {
  const rows = await pgClient`
    SELECT id, name_en, name_fr, name_ar, color_hex
    FROM tags
    WHERE organization_id = ${orgId} AND is_active = true
    ORDER BY name_en ASC
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    nameEn: r.name_en as string,
    nameFr: r.name_fr as string,
    nameAr: r.name_ar as string,
    colorHex: (r.color_hex as string) ?? "#6B7280",
  }));
}
