import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { invoiceStatusEnum } from "@/db/schema/invoices";
import { updateInvoiceStatus } from "@/lib/services/invoices/updateStatus";

const manualStatusSchema = z.object({
  status: z
    .enum(invoiceStatusEnum.enumValues)
    .refine((s) => s === "issued" || s === "voided", {
      message: "Only issued or voided are allowed via API",
    }),
  reason: z.string().optional(),
});

export const POST = withAuth(async (request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 });
    }

    const body = await request.json();
    const parsed = manualStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const invoice = await updateInvoiceStatus({
      invoiceId: id,
      orgId: user.organizationId,
      newStatus: parsed.data.status,
      changedBy: user.id,
      reason: parsed.data.reason ?? null,
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

    console.error("POST /api/invoices/[id]/status error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
