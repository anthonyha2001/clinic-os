import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { createInvoice } from "@/lib/services/invoices/create";

const schema = z.object({
  plan_id: z.string().uuid(),
});

export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const [plan] = await pgClient`
      SELECT id, patient_id, status, organization_id
      FROM plans
      WHERE id = ${parsed.data.plan_id}
        AND organization_id = ${user.organizationId}
      LIMIT 1
    `;
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    if (plan.status !== "completed") {
      return NextResponse.json(
        { error: "Plan must be completed before invoicing" },
        { status: 422 }
      );
    }

    // Get all completed plan items
    const items = await pgClient`
      SELECT
        pi.id,
        pi.service_id,
        pi.description_en,
        pi.quantity_completed,
        pi.quantity_total,
        pi.unit_price,
        s.name_en,
        s.name_fr,
        s.name_ar
      FROM plan_items pi
      LEFT JOIN services s ON s.id = pi.service_id
      WHERE pi.plan_id = ${parsed.data.plan_id}
        AND pi.quantity_completed > 0
      ORDER BY pi.sequence_order ASC
    `;

    if (items.length === 0) {
      return NextResponse.json(
        { error: "No completed sessions to invoice" },
        { status: 422 }
      );
    }

    const lines = items.map((item) => ({
      serviceId: item.service_id as string | null,
      planItemId: item.id as string,
      descriptionEn: `${item.description_en ?? item.name_en} (${item.quantity_completed}/${item.quantity_total} sessions)`,
      descriptionFr: `${item.description_en ?? item.name_fr} (${item.quantity_completed}/${item.quantity_total} séances)`,
      descriptionAr: `${item.description_en ?? item.name_ar} (${item.quantity_completed}/${item.quantity_total} جلسات)`,
      quantity: Number(item.quantity_completed),
      unitPrice: Number(item.unit_price),
    }));

    const invoice = await createInvoice({
      orgId: user.organizationId,
      patientId: plan.patient_id,
      createdBy: user.id,
      notes: "Invoice for treatment plan",
      lines,
    });

    return NextResponse.json(invoice, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    console.error("POST /api/plans/invoice error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
