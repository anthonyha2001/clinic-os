import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import {
  createPlanSchema,
  listPlansQuerySchema,
} from "@/lib/validations/plan";
import { createPlan } from "@/lib/services/plans/create";
import { listPlans } from "@/lib/services/plans/get";

export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();
    const parsed = createPlanSchema.safeParse(body);
    if (!parsed.success) {
      console.error("Plan validation failed:", JSON.stringify(parsed.error.issues, null, 2));
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const normalizedItems = parsed.data.items.map((item) => ({
      ...item,
      service_id: item.service_id ?? null,
      description_en: item.description_en,
      description_fr: item.description_fr ?? item.description_en,
      description_ar: item.description_ar ?? item.description_en,
    }));

    const plan = await createPlan({
      orgId: user.organizationId,
      patientId: parsed.data.patient_id,
      providerId: parsed.data.provider_id,
      createdBy: user.id,
      name_en: parsed.data.name_en,
      name_fr: parsed.data.name_fr ?? parsed.data.name_en,
      name_ar: parsed.data.name_ar ?? parsed.data.name_en,
      notes: parsed.data.notes ?? null,
      totalEstimatedCost: parsed.data.total_estimated_cost ?? null,
      items: normalizedItems,
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("POST /api/plans error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

export const GET = withAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = listPlansQuerySchema.safeParse({
      patient_id: searchParams.get("patient_id") ?? undefined,
      provider_id: searchParams.get("provider_id") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      start_date: searchParams.get("start_date") ?? undefined,
      end_date: searchParams.get("end_date") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const rows = await listPlans({
      orgId: user.organizationId,
      patientId: parsed.data.patient_id,
      providerId: parsed.data.provider_id,
      status: parsed.data.status,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
    });

    const plans = (rows as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id,
      name_en: row.name_en,
      name_fr: row.name_fr,
      name_ar: row.name_ar,
      status: row.status,
      total_estimated_cost: row.total_estimated_cost,
      proposed_at: row.proposed_at,
      created_at: row.created_at,
      patient_id: row.patient_id,
      provider_id: row.provider_id,
      patient: {
        first_name: row.patient_first_name,
        last_name: row.patient_last_name,
        phone: row.patient_phone,
      },
      provider: {
        user: { full_name: row.provider_name },
        full_name: row.provider_name,
      },
      item_count: row.item_count ?? 0,
      completed_sessions: row.quantity_completed_sum ?? 0,
      total_sessions: row.quantity_total_sum ?? 0,
    }));

    return NextResponse.json({ plans });
  } catch (e: unknown) {
    console.error("GET /api/plans error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
