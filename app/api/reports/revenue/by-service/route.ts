import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { getRevenueByService } from "@/lib/services/reports/revenueByService";

const querySchema = z.object({
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
});

export const GET = withAuth({ permissions: ["reports.view"] }, async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      start_date: searchParams.get("start_date"),
      end_date: searchParams.get("end_date"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    if (new Date(parsed.data.end_date).getTime() <= new Date(parsed.data.start_date).getTime()) {
      return NextResponse.json({ error: "end_date must be greater than start_date" }, { status: 422 });
    }

    const data = await getRevenueByService({
      orgId: user.organizationId,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/reports/revenue/by-service error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
