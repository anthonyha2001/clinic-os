import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getPlan } from "@/lib/services/plans/get";
import { updatePlan } from "@/lib/services/plans/update";
import { updatePlanSchema } from "@/lib/validations/plan";

export const GET = withAuth(async (_request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Plan ID required" }, { status: 400 });
    }

    const plan = await getPlan({
      planId: id,
      orgId: user.organizationId,
    });
    return NextResponse.json({ plan });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    console.error("GET /api/plans/[id] error:", err);
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
      return NextResponse.json({ error: "Plan ID required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = updatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const plan = await updatePlan({
      planId: id,
      orgId: user.organizationId,
      data: {
        name_en: parsed.data.name_en,
        name_fr: parsed.data.name_fr,
        name_ar: parsed.data.name_ar,
        notes: parsed.data.notes,
        total_estimated_cost: parsed.data.total_estimated_cost,
        items: parsed.data.items,
      },
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

    console.error("PATCH /api/plans/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
