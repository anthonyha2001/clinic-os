import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getRebookSuggestion } from "@/lib/services/noshow/rebookSuggestion";
import { pgClient } from "@/db/index";

function err422(message: string): never {
  const e = new Error(message) as Error & { statusCode: number };
  e.statusCode = 422;
  throw e;
}

export const GET = withAuth(async (_request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json(
        { error: "Appointment ID required" },
        { status: 400 }
      );
    }

    const [appointment] = await pgClient`
      SELECT id, status
      FROM appointments
      WHERE id = ${id}
        AND organization_id = ${user.organizationId}
      LIMIT 1
    `;

    if (!appointment || appointment.status !== "completed") {
      err422("Rebook suggestion only available for completed appointments");
    }

    const suggestion = await getRebookSuggestion(id, user.organizationId);
    return NextResponse.json(suggestion);
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    console.error("GET /api/appointments/[id]/rebook-suggestion error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
