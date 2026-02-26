import { pgClient } from "@/db/index";
import type { CreatePatient } from "@/lib/validations/patient";

export interface CreatedPatient {
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

function err409(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 409;
  throw e;
}

export async function createPatient(
  input: CreatePatient,
  orgId: string
): Promise<CreatedPatient> {
  const [existing] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${orgId} AND phone = ${input.phone}
  `;
  if (existing) {
    err409("A patient with this phone number already exists");
  }

  const [inserted] = await pgClient`
    INSERT INTO patients (
      organization_id, first_name, last_name, date_of_birth, gender,
      email, phone, phone_secondary, address, preferred_locale
    )
    VALUES (
      ${orgId}, ${input.firstName}, ${input.lastName},
      ${input.dateOfBirth || null}, ${input.gender || null},
      ${input.email || null}, ${input.phone}, ${input.phoneSecondary || null},
      ${input.address || null}, ${input.preferredLocale || null}
    )
    RETURNING *
  `;

  return {
    id: inserted.id,
    organizationId: inserted.organization_id,
    firstName: inserted.first_name,
    lastName: inserted.last_name,
    dateOfBirth: inserted.date_of_birth,
    gender: inserted.gender,
    email: inserted.email,
    phone: inserted.phone,
    phoneSecondary: inserted.phone_secondary,
    address: inserted.address,
    preferredLocale: inserted.preferred_locale,
    isActive: inserted.is_active,
    createdAt: inserted.created_at,
    updatedAt: inserted.updated_at,
  };
}
