import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const POST = withAuth(async (request, { user, params }) => {
  try {
    const patientId = params?.id as string | undefined;
    if (!patientId) {
      return NextResponse.json({ error: "Patient ID required" }, { status: 400 });
    }

    const body = await request.json();
    const tagId = typeof body?.tag_id === "string" ? body.tag_id : null;
    if (!tagId) {
      return NextResponse.json(
        { error: "tag_id is required" },
        { status: 422 }
      );
    }

    const [patient] = await pgClient`
      SELECT id FROM patients
      WHERE id = ${patientId} AND organization_id = ${user.organizationId}
    `;
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const [tag] = await pgClient`
      SELECT id FROM tags
      WHERE id = ${tagId} AND organization_id = ${user.organizationId}
    `;
    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    await pgClient`
      INSERT INTO patient_tags (patient_id, tag_id)
      VALUES (${patientId}, ${tagId})
      ON CONFLICT (patient_id, tag_id) DO NOTHING
    `;

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("POST /api/patients/[id]/tags error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
