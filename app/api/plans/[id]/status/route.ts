import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { updatePlanStatusSchema } from "@/lib/validations/plan";
import { updatePlanStatus } from "@/lib/services/plans/updateStatus";

export const POST = withAuth(async (request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Plan ID required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updatePlanStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const plan = await updatePlanStatus({
      planId: id,
      orgId: user.organizationId,
      newStatus: parsed.data.status,
      changedBy: user.id,
      reason: parsed.data.reason ?? null,
    });

    return NextResponse.json(plan);
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("POST /api/plans/[id]/status error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
