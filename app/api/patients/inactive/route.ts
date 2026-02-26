import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getInactivePatients } from "@/lib/services/noshow/inactivePatients";

export const GET = withAuth(async (_request, { user }) => {
  try {
    const data = await getInactivePatients(user.organizationId);
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/patients/inactive error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
