import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const DELETE = withAuth(async (_request, { user, params }) => {
  try {
    const patientId = params?.id as string | undefined;
    const tagId = params?.tagId as string | undefined;
    if (!patientId || !tagId) {
      return NextResponse.json(
        { error: "Patient ID and tag ID required" },
        { status: 400 }
      );
    }

    const [deleted] = await pgClient`
      DELETE FROM patient_tags pt
      USING tags t
      WHERE pt.patient_id = ${patientId}
        AND pt.tag_id = ${tagId}
        AND t.id = pt.tag_id
        AND t.organization_id = ${user.organizationId}
      RETURNING pt.patient_id
    `;

    if (!deleted) {
      return NextResponse.json(
        { error: "Patient or tag not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/patients/[id]/tags/[tagId] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
