import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { isValidUUID } from "@/lib/validations/utils";

const bloodTypeEnum = z
  .enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"])
  .nullable()
  .optional();

const upsertMedicalHistorySchema = z.object({
  blood_type: bloodTypeEnum,
  allergies: z.array(z.string().max(100)).max(50).default([]),
  medications: z.array(z.string().max(100)).max(50).default([]),
  medical_conditions: z.array(z.string().max(100)).max(50).default([]),
  previous_surgeries: z.string().max(2000).optional().nullable(),
  smoking: z.boolean().default(false),
  alcohol: z.boolean().default(false),
  pregnant: z.boolean().default(false),
  diabetic: z.boolean().default(false),
  hypertensive: z.boolean().default(false),
  heart_condition: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

export const GET = withAuth(async (request, { user, params }) => {
  try {
    const patientId = params?.patientId as string;
    if (!patientId || !isValidUUID(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }
    const [row] = await pgClient`
      SELECT * FROM patient_medical_history
      WHERE patient_id = ${patientId}
        AND organization_id = ${user.organizationId}
    `;
    return NextResponse.json(row ?? null);
  } catch (e) {
    console.error("GET /api/dental/medical-history error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request, { user, params }) => {
  try {
    const patientId = params?.patientId as string;
    const body = await request.json();
    const parsed = upsertMedicalHistorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    if (!patientId || !isValidUUID(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    const d = parsed.data;

    const [row] = await pgClient`
      INSERT INTO patient_medical_history (
        organization_id, patient_id, blood_type, allergies, medications,
        medical_conditions, previous_surgeries, smoking, alcohol, pregnant,
        diabetic, hypertensive, heart_condition, notes
      ) VALUES (
        ${user.organizationId}, ${patientId},
        ${d.blood_type ?? null}, ${d.allergies},
        ${d.medications}, ${d.medical_conditions},
        ${d.previous_surgeries ?? null}, ${d.smoking},
        ${d.alcohol}, ${d.pregnant},
        ${d.diabetic}, ${d.hypertensive},
        ${d.heart_condition}, ${d.notes ?? null}
      )
      ON CONFLICT (patient_id) DO UPDATE SET
        blood_type = EXCLUDED.blood_type,
        allergies = EXCLUDED.allergies,
        medications = EXCLUDED.medications,
        medical_conditions = EXCLUDED.medical_conditions,
        previous_surgeries = EXCLUDED.previous_surgeries,
        smoking = EXCLUDED.smoking, alcohol = EXCLUDED.alcohol,
        pregnant = EXCLUDED.pregnant, diabetic = EXCLUDED.diabetic,
        hypertensive = EXCLUDED.hypertensive,
        heart_condition = EXCLUDED.heart_condition,
        notes = EXCLUDED.notes, updated_at = now()
      RETURNING *
    `;
    return NextResponse.json(row);
  } catch (e) {
    console.error("POST /api/dental/medical-history error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
