import { pgClient } from "@/db/index";

export interface PatientTagItem {
  id: string;
  tagId: string;
  nameEn: string;
  nameFr: string;
  nameAr: string;
  colorHex: string;
}

export async function getPatientTags(
  patientId: string,
  orgId: string
): Promise<PatientTagItem[]> {
  const rows = await pgClient`
    SELECT t.id as tag_id, t.name_en, t.name_fr, t.name_ar, t.color_hex
    FROM patient_tags pt
    JOIN tags t ON t.id = pt.tag_id
    WHERE pt.patient_id = ${patientId}
      AND t.organization_id = ${orgId}
      AND t.is_active = true
    ORDER BY t.name_en ASC
  `;
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    id: `${patientId}-${r.tag_id}`,
    tagId: r.tag_id as string,
    nameEn: r.name_en as string,
    nameFr: r.name_fr as string,
    nameAr: r.name_ar as string,
    colorHex: (r.color_hex as string) ?? "#6B7280",
  }));
}
