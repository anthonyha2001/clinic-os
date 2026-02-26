import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createPatientSchema } from "@/lib/validations/patient";
import { listPatients } from "@/lib/services/patients/list";
import { createPatient } from "@/lib/services/patients/create";

export const GET = withAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") ?? undefined;
    const activeOnly = searchParams.get("activeOnly") !== "false";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    const { patients, total } = await listPatients(user.organizationId, {
      search,
      activeOnly,
      limit,
      offset,
    });
    return NextResponse.json({ patients, total });
  } catch (e) {
    console.error("GET /api/patients error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();

    const parsed = createPatientSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const patient = await createPatient(parsed.data, user.organizationId);
    return NextResponse.json(patient, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 409) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("POST /api/patients error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
