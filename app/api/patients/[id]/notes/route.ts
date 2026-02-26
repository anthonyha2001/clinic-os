import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (_request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Patient ID required" }, { status: 400 });
    }

    const rows = await pgClient`
      SELECT pn.id, pn.content, pn.is_pinned, pn.created_at, pn.author_id, u.full_name as author_name
      FROM patient_notes pn
      JOIN users u ON u.id = pn.author_id
      WHERE pn.patient_id = ${id}
        AND pn.organization_id = ${user.organizationId}
        AND pn.deleted_at IS NULL
      ORDER BY pn.is_pinned DESC, pn.created_at DESC
      LIMIT 20
    `;

    const notes = (rows as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      content: r.content,
      isPinned: r.is_pinned,
      createdAt: typeof r.created_at === "string" ? r.created_at : (r.created_at as Date).toISOString(),
      authorId: r.author_id,
      authorName: r.author_name,
    }));

    return NextResponse.json(notes);
  } catch (e) {
    console.error("GET /api/patients/[id]/notes error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Patient ID required" }, { status: 400 });
    }

    const [patient] = await pgClient`
      SELECT id FROM patients WHERE id = ${id} AND organization_id = ${user.organizationId}
    `;
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 422 });
    }

    const [inserted] = await pgClient`
      INSERT INTO patient_notes (patient_id, organization_id, author_id, content)
      VALUES (${id}, ${user.organizationId}, ${user.id}, ${content})
      RETURNING id, content, is_pinned, created_at
    `;

    return NextResponse.json(
      {
        id: inserted.id,
        content: inserted.content,
        isPinned: inserted.is_pinned,
        createdAt: inserted.created_at,
        authorName: user.fullName,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("POST /api/patients/[id]/notes error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
