import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { applyDiscount } from "@/lib/services/invoices/applyDiscount";

const discountSchema = z.object({
  discount_percent: z.number().min(0.01).max(100).optional(),
  discount_amount: z.number().min(0.01).optional(),
  reason: z.string().min(3),
}).superRefine((data, ctx) => {
  const hasPercent = data.discount_percent != null;
  const hasAmount = data.discount_amount != null;
  if ((hasPercent && hasAmount) || (!hasPercent && !hasAmount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide exactly one of discount_percent or discount_amount",
      path: ["discount_percent"],
    });
  }
});

export const PATCH = withAuth(async (request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = discountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const invoice = await applyDiscount({
      invoiceId: id,
      orgId: user.organizationId,
      appliedBy: user.id,
      discountPercent: parsed.data.discount_percent,
      discountAmount: parsed.data.discount_amount,
      reason: parsed.data.reason,
      permissions: user.permissions,
    });

    return NextResponse.json(invoice);
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 403) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("PATCH /api/invoices/[id]/discount error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
