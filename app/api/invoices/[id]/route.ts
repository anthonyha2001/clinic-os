import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getInvoice } from "@/lib/services/invoices/get";

export const GET = withAuth(async (_request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 });
    }

    const invoice = await getInvoice({
      invoiceId: id,
      orgId: user.organizationId,
    });
    return NextResponse.json({ invoice });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    console.error("GET /api/invoices/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
