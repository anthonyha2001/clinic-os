import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const PATCH = withAuth(async (request, { user, params }) => {
  try {
    const patientId = params?.id as string | undefined;
    const noteId = params?.noteId as string | undefined;
    if (!patientId || !noteId) {
      return NextResponse.json(
        { error: "Patient ID and note ID required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const isPinned = typeof body?.is_pinned === "boolean" ? body.is_pinned : undefined;
    if (isPinned === undefined) {
      return NextResponse.json(
        { error: "is_pinned is required" },
        { status: 422 }
      );
    }

    const [updated] = await pgClient`
      UPDATE patient_notes
      SET is_pinned = ${isPinned}
      WHERE id = ${noteId}
        AND patient_id = ${patientId}
        AND organization_id = ${user.organizationId}
        AND deleted_at IS NULL
      RETURNING id, content, is_pinned, created_at
    `;

    if (!updated) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      content: updated.content,
      isPinned: updated.is_pinned,
      createdAt: typeof updated.created_at === "string" ? updated.created_at : (updated.created_at as Date).toISOString(),
    });
  } catch (e) {
    console.error("PATCH /api/patients/[id]/notes/[noteId] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async (_request, { user, params }) => {
  try {
    const patientId = params?.id as string | undefined;
    const noteId = params?.noteId as string | undefined;
    if (!patientId || !noteId) {
      return NextResponse.json(
        { error: "Patient ID and note ID required" },
        { status: 400 }
      );
    }

    const [updated] = await pgClient`
      UPDATE patient_notes
      SET deleted_at = now()
      WHERE id = ${noteId}
        AND patient_id = ${patientId}
        AND organization_id = ${user.organizationId}
        AND author_id = ${user.id}
        AND deleted_at IS NULL
      RETURNING id
    `;

    if (!updated) {
      return NextResponse.json(
        { error: "Note not found or not authorized to delete" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/patients/[id]/notes/[noteId] error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
