import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { getUnpaidInvoices } from "@/lib/services/reports/unpaid";

const querySchema = z.object({
  sort_by: z.enum(["balance_due", "days_outstanding", "created_at"]).default("days_outstanding"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

export const GET = withAuth({ permissions: ["reports.view"] }, async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      sort_by: searchParams.get("sort_by") ?? undefined,
      sort_order: searchParams.get("sort_order") ?? undefined,
      start_date: searchParams.get("start_date") ?? undefined,
      end_date: searchParams.get("end_date") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const data = await getUnpaidInvoices({
      orgId: user.organizationId,
      sortBy: parsed.data.sort_by,
      sortOrder: parsed.data.sort_order,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
    });

    const nameParts = (name: string) => {
      const idx = name.indexOf(" ");
      if (idx <= 0) return { first_name: name || "", last_name: "" };
      return { first_name: name.slice(0, idx), last_name: name.slice(idx + 1) };
    };

    const invoices = data.invoices.map((inv) => {
      const { first_name, last_name } = nameParts(inv.patientName);
      return {
        id: inv.invoiceId,
        invoice_number: inv.invoiceNumber,
        patient: {
          first_name,
          last_name,
          phone: inv.patientPhone,
        },
        total: inv.total,
        balance_due: inv.balanceDue,
        days_outstanding: inv.daysOutstanding,
        status: inv.status,
      };
    });

    return NextResponse.json({
      invoices,
      summary: {
        totalUnpaidAmount: data.summary.totalUnpaidAmount,
        totalUnpaidCount: data.summary.totalUnpaidCount,
      },
    });
  } catch (e) {
    console.error("GET /api/reports/unpaid error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
