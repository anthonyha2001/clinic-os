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
  if (!patientId) {
    return NextResponse.json({ error: "Patient ID required" }, { status: 422 });
  }
  const [patient] = await pgClient`
    SELECT id FROM patients
    WHERE id = ${patientId} AND organization_id = ${user.organizationId}
    LIMIT 1
  `;
  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  const body = await request.json();
  const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : null;
  if (!fileUrl) {
    return NextResponse.json({ error: "file_url required" }, { status: 422 });
  }
  const [row] = await pgClient`
    INSERT INTO dental_xrays (
      organization_id, patient_id, tooth_number, xray_type,
      file_url, file_name, notes, taken_at, uploaded_by
    ) VALUES (
      ${user.organizationId}, ${patientId},
      ${body.tooth_number ?? null}, ${body.xray_type ?? "periapical"},
      ${fileUrl}, ${body.file_name ?? null},
      ${body.notes ?? null}, ${body.taken_at ?? new Date().toISOString().split("T")[0]},
      ${user.id}
    )
    RETURNING *
  `;
  return NextResponse.json(row, { status: 201 });
});