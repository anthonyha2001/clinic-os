import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { createPayment } from "@/lib/services/payments/create";

const createPaymentSchema = z.object({
  patient_id: z.string().uuid(),
  payment_method_id: z.string().uuid(),
  amount: z.number().min(0.01),
  reference_number: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  allocations: z.array(
    z.object({
      invoice_id: z.string().uuid(),
      amount: z.number().min(0.01),
    })
  ).min(1, "At least one allocation is required"),
});

export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();
    const parsed = createPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const payment = await createPayment({
      orgId: user.organizationId,
      patientId: parsed.data.patient_id,
      paymentMethodId: parsed.data.payment_method_id,
      amount: parsed.data.amount,
      referenceNumber: parsed.data.reference_number ?? null,
      notes: parsed.data.notes ?? null,
      receivedBy: user.id,
      allocations: parsed.data.allocations,
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("POST /api/payments error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
