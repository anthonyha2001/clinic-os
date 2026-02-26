import { pgClient } from "@/db/index";
import { getPatient } from "./get";
import type { UpdatePatient } from "@/lib/validations/patient";

export interface UpdatedPatient {
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

export async function updatePatient(
  patientId: string,
  orgId: string,
  input: UpdatePatient
): Promise<UpdatedPatient> {
  const existing = await getPatient(patientId, orgId);
  if (!existing) {
    const e = new Error("Patient not found") as Error & { statusCode: number };
    e.statusCode = 404;
    throw e;
  }

  if (input.phone !== undefined && input.phone !== existing.phone) {
    const [duplicate] = await pgClient`
      SELECT id FROM patients
      WHERE organization_id = ${orgId} AND phone = ${input.phone}
    `;
    if (duplicate) {
      err409("A patient with this phone number already exists");
    }
  }

  const merged = {
    firstName: input.firstName ?? existing.firstName,
    lastName: input.lastName ?? existing.lastName,
    dateOfBirth: input.dateOfBirth !== undefined ? input.dateOfBirth : existing.dateOfBirth,
    gender: input.gender !== undefined ? input.gender : existing.gender,
    email: input.email !== undefined ? input.email : existing.email,
    phone: input.phone ?? existing.phone,
    phoneSecondary: input.phoneSecondary !== undefined ? input.phoneSecondary : existing.phoneSecondary,
    address: input.address !== undefined ? input.address : existing.address,
    preferredLocale: input.preferredLocale !== undefined ? input.preferredLocale : existing.preferredLocale,
    isActive: input.isActive ?? existing.isActive,
  };

  const [updated] = await pgClient`
    UPDATE patients SET
      first_name = ${merged.firstName},
      last_name = ${merged.lastName},
      date_of_birth = ${merged.dateOfBirth},
      gender = ${merged.gender},
      email = ${merged.email},
      phone = ${merged.phone},
      phone_secondary = ${merged.phoneSecondary},
      address = ${merged.address},
      preferred_locale = ${merged.preferredLocale},
      is_active = ${merged.isActive},
      updated_at = now()
    WHERE id = ${patientId} AND organization_id = ${orgId}
    RETURNING *
  `;

  if (!updated) {
    const e = new Error("Patient not found") as Error & { statusCode: number };
    e.statusCode = 404;
    throw e;
  }

  return {
    id: updated.id,
    organizationId: updated.organization_id,
    firstName: updated.first_name,
    lastName: updated.last_name,
    dateOfBirth: updated.date_of_birth,
    gender: updated.gender,
    email: updated.email,
    phone: updated.phone,
    phoneSecondary: updated.phone_secondary,
    address: updated.address,
    preferredLocale: updated.preferred_locale,
    isActive: updated.is_active,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}
