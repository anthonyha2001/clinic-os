import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { isValidUUID } from "@/lib/validations/utils";

const upsertToothSchema = z.object({
  tooth_number: z.number().int().min(1).max(52),
  conditions: z.array(z.string().max(50)).max(20).default([]),
  notes: z.string().max(1000).optional().nullable(),
});

export const GET = withAuth(async (request, { user, params }) => {
  try {
    const patientId = params?.patientId as string;
    if (!patientId || !isValidUUID(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }
    const rows = await pgClient`
      SELECT tooth_number, conditions, notes, updated_at
      FROM dental_chart
      WHERE patient_id = ${patientId}
        AND organization_id = ${user.organizationId}
      ORDER BY tooth_number ASC
    `;
    return NextResponse.json(rows);
  } catch (e) {
    console.error("GET /api/dental/chart error:", e);
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
    const parsed = upsertToothSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    if (!patientId || !isValidUUID(patientId)) {
      return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
    }

    const { tooth_number, conditions, notes } = parsed.data;

    const [row] = await pgClient`
      INSERT INTO dental_chart (organization_id, patient_id, tooth_number, conditions, notes, updated_by)
      VALUES (${user.organizationId}, ${patientId}, ${tooth_number}, ${conditions}, ${notes ?? null}, ${user.id})
      ON CONFLICT (patient_id, tooth_number) DO UPDATE
      SET conditions = ${conditions}, notes = ${notes ?? null},
          updated_by = ${user.id}, updated_at = now()
      RETURNING *
    `;
    return NextResponse.json(row);
  } catch (e) {
    console.error("POST /api/dental/chart error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
