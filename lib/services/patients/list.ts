import { pgClient } from "@/db/index";

export interface PatientTagItem {
  id: string;
  name_en: string;
  color_hex: string;
}

export interface PatientListItem {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  phone: string;
  phoneSecondary: string | null;
  isActive: boolean;
  createdAt: Date;
  lastVisitAt: string | null;
  riskScore: number;
  tagNames: string[];
  tags: PatientTagItem[];
}

export interface ListPatientsOptions {
  search?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListPatientsResult {
  patients: PatientListItem[];
  total: number;
}

export async function listPatients(
  orgId: string,
  options?: ListPatientsOptions
): Promise<ListPatientsResult> {
  const search = options?.search?.trim();
  const activeOnly = options?.activeOnly ?? true;
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);

  const activeFilter = activeOnly;
  const pattern = search ? `%${search}%` : null;

  const countQuery = pattern
    ? pgClient`
        SELECT COUNT(*)::int AS total
        FROM patients p
        WHERE p.organization_id = ${orgId}
          AND (${!activeFilter} OR p.is_active = true)
          AND (
            p.first_name ILIKE ${pattern}
            OR p.last_name ILIKE ${pattern}
            OR p.phone ILIKE ${pattern}
            OR p.email ILIKE ${pattern}
          )
      `
    : pgClient`
        SELECT COUNT(*)::int AS total
        FROM patients p
        WHERE p.organization_id = ${orgId}
          AND (${!activeFilter} OR p.is_active = true)
      `;

  const [countRow] = await countQuery;
  const total = (countRow as { total: number }).total;

  const selectQuery = pattern
    ? pgClient`
        SELECT p.id, p.first_name, p.last_name, p.date_of_birth, p.gender,
               p.email, p.phone, p.phone_secondary, p.is_active, p.created_at,
               (
                 SELECT a.start_time::text
                 FROM appointments a
                 WHERE a.patient_id = p.id
                   AND a.organization_id = p.organization_id
                 ORDER BY a.start_time DESC
                 LIMIT 1
               ) AS last_visit_at,
               COALESCE(rs.risk_score, 0)::int AS risk_score,
               (
                 SELECT COALESCE(array_agg(t.name_en), ARRAY[]::text[])
                 FROM patient_tags pt
                 JOIN tags t ON t.id = pt.tag_id
                 WHERE pt.patient_id = p.id AND t.organization_id = p.organization_id
               ) AS tag_names,
               (
                 SELECT COALESCE(json_agg(json_build_object('id', t.id, 'name_en', t.name_en, 'color_hex', COALESCE(t.color_hex, '#6B7280'))), '[]'::json)
                 FROM patient_tags pt
                 JOIN tags t ON t.id = pt.tag_id
                 WHERE pt.patient_id = p.id AND t.organization_id = p.organization_id
               ) AS tags
        FROM patients p
        LEFT JOIN risk_scores rs ON rs.patient_id = p.id AND rs.organization_id = p.organization_id
        WHERE p.organization_id = ${orgId}
          AND (${!activeFilter} OR p.is_active = true)
          AND (
            p.first_name ILIKE ${pattern}
            OR p.last_name ILIKE ${pattern}
            OR p.phone ILIKE ${pattern}
            OR p.email ILIKE ${pattern}
          )
        ORDER BY p.last_name ASC, p.first_name ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `
    : pgClient`
        SELECT p.id, p.first_name, p.last_name, p.date_of_birth, p.gender,
               p.email, p.phone, p.phone_secondary, p.is_active, p.created_at,
               (
                 SELECT a.start_time::text
                 FROM appointments a
                 WHERE a.patient_id = p.id
                   AND a.organization_id = p.organization_id
                 ORDER BY a.start_time DESC
                 LIMIT 1
               ) AS last_visit_at,
               COALESCE(rs.risk_score, 0)::int AS risk_score,
               (
                 SELECT COALESCE(array_agg(t.name_en), ARRAY[]::text[])
                 FROM patient_tags pt
                 JOIN tags t ON t.id = pt.tag_id
                 WHERE pt.patient_id = p.id AND t.organization_id = p.organization_id
               ) AS tag_names,
               (
                 SELECT COALESCE(json_agg(json_build_object('id', t.id, 'name_en', t.name_en, 'color_hex', COALESCE(t.color_hex, '#6B7280'))), '[]'::json)
                 FROM patient_tags pt
                 JOIN tags t ON t.id = pt.tag_id
                 WHERE pt.patient_id = p.id AND t.organization_id = p.organization_id
               ) AS tags
        FROM patients p
        LEFT JOIN risk_scores rs ON rs.patient_id = p.id AND rs.organization_id = p.organization_id
        WHERE p.organization_id = ${orgId}
          AND (${!activeFilter} OR p.is_active = true)
        ORDER BY p.last_name ASC, p.first_name ASC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

  const rows = await selectQuery;

  return {
    patients: (rows as unknown as Record<string, unknown>[]).map(toListItem),
    total,
  };
}

function toListItem(row: Record<string, unknown>): PatientListItem {
  const tagsRaw = row.tags;
  const tags: PatientTagItem[] = Array.isArray(tagsRaw)
    ? (tagsRaw as { id: string; name_en: string; color_hex: string }[])
    : [];
  return {
    id: row.id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    dateOfBirth: row.date_of_birth as string | null,
    gender: row.gender as string | null,
    email: row.email as string | null,
    phone: row.phone as string,
    phoneSecondary: row.phone_secondary as string | null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as Date,
    lastVisitAt: row.last_visit_at as string | null,
    riskScore: Number(row.risk_score) || 0,
    tagNames: Array.isArray(row.tag_names) ? (row.tag_names as string[]) : [],
    tags,
  };
}
