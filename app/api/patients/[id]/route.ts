import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { updatePatientSchema } from "@/lib/validations/patient";
import { getPatient } from "@/lib/services/patients/get";
import { getRiskScore } from "@/lib/services/patients/getRiskScore";
import { getPatientTags } from "@/lib/services/patients/getTags";
import { updatePatient } from "@/lib/services/patients/update";

export const GET = withAuth(async (_request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Patient ID required" }, { status: 400 });
    }

    const [patient, riskScore, tagList] = await Promise.all([
      getPatient(id, user.organizationId),
      getRiskScore(id, user.organizationId),
      getPatientTags(id, user.organizationId),
    ]);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }
    const tags = tagList.map((t) => ({
      id: t.tagId,
      name_en: t.nameEn,
      color_hex: t.colorHex,
    }));
    return NextResponse.json({
      patient: { ...patient, tags },
      risk_score: riskScore,
    });
  } catch (e) {
    console.error("GET /api/patients/[id] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const PATCH = withAuth(async (request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Patient ID required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updatePatientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const patient = await updatePatient(id, user.organizationId, parsed.data);
    return NextResponse.json(patient);
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 409) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("PATCH /api/patients/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(
  { roles: ["admin", "manager"] },
  async (_request, { user, params }) => {
    try {
      const id = params?.id as string | undefined;
      if (!id) {
        return NextResponse.json({ error: "Patient ID required" }, { status: 400 });
      }

      const [existing] = await pgClient`
        SELECT id FROM patients
        WHERE id = ${id}
          AND organization_id = ${user.organizationId}
          AND deleted_at IS NULL
        LIMIT 1
      `;
      if (!existing) {
        return NextResponse.json({ error: "Patient not found" }, { status: 404 });
      }

      await pgClient`
        UPDATE patients SET
          deleted_at = now(),
          is_active = false,
          updated_at = now()
        WHERE id = ${id}
          AND organization_id = ${user.organizationId}
      `;

      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error("DELETE /api/patients/[id] error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
