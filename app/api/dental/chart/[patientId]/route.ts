import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user, params }) => {
  const patientId = params?.patientId as string;
  const rows = await pgClient`
    SELECT tooth_number, conditions, notes, updated_at
    FROM dental_chart
    WHERE patient_id = ${patientId}
      AND organization_id = ${user.organizationId}
    ORDER BY tooth_number ASC
  `;
  return NextResponse.json(rows);
});

export const POST = withAuth(async (request, { user, params }) => {
  const patientId = params?.patientId as string;
  const body = await request.json();
  const { tooth_number, conditions, notes } = body;

  const [row] = await pgClient`
    INSERT INTO dental_chart (organization_id, patient_id, tooth_number, conditions, notes, updated_by)
    VALUES (${user.organizationId}, ${patientId}, ${tooth_number}, ${conditions}, ${notes ?? null}, ${user.id})
    ON CONFLICT (patient_id, tooth_number) DO UPDATE
    SET conditions = ${conditions}, notes = ${notes ?? null},
        updated_by = ${user.id}, updated_at = now()
    RETURNING *
  `;
  return NextResponse.json(row);
});