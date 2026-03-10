import { pgClient } from "@/db/index";

export interface PatientDetail {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  phone: string;
  phoneSecondary: string | null;
  address: string | null;
  preferredLocale: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export async function getPatient(
  patientId: string,
  orgId: string
): Promise<PatientDetail | null> {
  const [row] = await pgClient`
    SELECT id, organization_id, first_name, last_name, date_of_birth, gender,
           email, phone, phone_secondary, address, preferred_locale, is_active,
           created_at, updated_at
    FROM patients
    WHERE id = ${patientId} AND organization_id = ${orgId} AND deleted_at IS NULL
  `;
  if (!row) return null;

  return {
    id: row.id,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    email: row.email,
    phone: row.phone,
    phoneSecondary: row.phone_secondary,
    address: row.address,
    preferredLocale: row.preferred_locale,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
