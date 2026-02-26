import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user, params }) => {
  const patientId = params?.patientId as string;
  const [row] = await pgClient`
    SELECT * FROM patient_medical_history
    WHERE patient_id = ${patientId}
      AND organization_id = ${user.organizationId}
  `;
  return NextResponse.json(row ?? null);
});

export const POST = withAuth(async (request, { user, params }) => {
  const patientId = params?.patientId as string;
  const body = await request.json();

  const [row] = await pgClient`
    INSERT INTO patient_medical_history (
      organization_id, patient_id, blood_type, allergies, medications,
      medical_conditions, previous_surgeries, smoking, alcohol, pregnant,
      diabetic, hypertensive, heart_condition, notes
    ) VALUES (
      ${user.organizationId}, ${patientId},
      ${body.blood_type ?? null}, ${body.allergies ?? []},
      ${body.medications ?? []}, ${body.medical_conditions ?? []},
      ${body.previous_surgeries ?? null}, ${body.smoking ?? false},
      ${body.alcohol ?? false}, ${body.pregnant ?? false},
      ${body.diabetic ?? false}, ${body.hypertensive ?? false},
      ${body.heart_condition ?? false}, ${body.notes ?? null}
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
});