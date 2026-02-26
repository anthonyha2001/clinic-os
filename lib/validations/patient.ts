import { z } from "zod";

const optionalEmail = z
  .union([z.string().email(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));
const optionalString = z
  .union([z.string(), z.literal("")])
  .transform((v) => (v === "" ? null : v));

export const createPatientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(255),
  lastName: z.string().min(1, "Last name is required").max(255),
  dateOfBirth: z.string().optional().nullable().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  gender: z.enum(["male", "female", "other"]).optional().nullable().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  email: optionalEmail.optional().nullable(),
  phone: z.string().min(1, "Phone is required").max(50),
  phoneSecondary: z.string().max(50).optional().nullable().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  address: optionalString.optional().nullable(),
  preferredLocale: z.string().length(2).optional().nullable().or(z.literal("")).transform((v) => (v === "" ? null : v)),
});

export const updatePatientSchema = createPatientSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreatePatient = z.infer<typeof createPatientSchema>;
export type UpdatePatient = z.infer<typeof updatePatientSchema>;
