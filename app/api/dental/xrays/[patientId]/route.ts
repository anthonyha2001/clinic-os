import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (request, { user, params }) => {
  const patientId = params?.patientId as string;
  const rows = await pgClient`
    SELECT * FROM dental_xrays
    WHERE patient_id = ${patientId}
      AND organization_id = ${user.organizationId}
    ORDER BY taken_at DESC
  `;
  return NextResponse.json(rows);
});

export const POST = withAuth(async (request, { user, params }) => {
  const patientId = params?.patientId as string;
  const body = await request.json();
  const [row] = await pgClient`
    INSERT INTO dental_xrays (
      organization_id, patient_id, tooth_number, xray_type,
      file_url, file_name, notes, taken_at, uploaded_by
    ) VALUES (
      ${user.organizationId}, ${patientId},
      ${body.tooth_number ?? null}, ${body.xray_type ?? "periapical"},
      ${body.file_url}, ${body.file_name},
      ${body.notes ?? null}, ${body.taken_at ?? new Date().toISOString().split("T")[0]},
      ${user.id}
    )
    RETURNING *
  `;
  return NextResponse.json(row, { status: 201 });
});