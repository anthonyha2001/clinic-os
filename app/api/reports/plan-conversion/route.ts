import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { getPlanConversion } from "@/lib/services/reports/planConversion";

const querySchema = z.object({
  group_by: z.enum(["month", "provider"]).default("month"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  provider_id: z.string().uuid().optional(),
});

function defaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  return {
    start: start.toISOString().slice(0, 10) + "T00:00:00.000Z",
    end: end.toISOString().slice(0, 10) + "T23:59:59.999Z",
  };
}

export const GET = withAuth({ permissions: ["reports.view"] }, async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      group_by: searchParams.get("group_by") ?? "month",
      start_date: searchParams.get("start_date") ?? undefined,
      end_date: searchParams.get("end_date") ?? undefined,
      provider_id: searchParams.get("provider_id") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    let startDate = parsed.data.start_date;
    let endDate = parsed.data.end_date;
    if (!startDate || !endDate) {
      const def = defaultDateRange();
      startDate = startDate ?? def.start;
      endDate = endDate ?? def.end;
    }
    if (startDate.length === 10) startDate = startDate + "T00:00:00.000Z";
    if (endDate.length === 10) endDate = endDate + "T23:59:59.999Z";

    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      return NextResponse.json(
        { error: "end_date must be greater than start_date" },
        { status: 422 }
      );
    }

    const data = await getPlanConversion({
      orgId: user.organizationId,
      startDate,
      endDate,
      providerId: parsed.data.provider_id,
    });

    const summary = {
      total_proposed: data.summary.totalProposed,
      total_accepted: data.summary.totalAccepted,
      total_completed: data.summary.totalCompleted,
      total_canceled: data.summary.totalCanceled,
      overall_acceptance_rate: Math.round(data.summary.conversionRate * 1000) / 10,
      overall_completion_rate: Math.round(data.summary.completionRate * 1000) / 10,
    };

    let rows: { period: string; proposed: number; accepted: number; completed: number; canceled: number; acceptance_rate: number; completion_rate: number }[];

    if (parsed.data.group_by === "provider" && data.byProvider) {
      rows = data.byProvider.map((p) => ({
        period: p.providerName,
        proposed: p.proposed,
        accepted: p.accepted,
        completed: p.completed,
        canceled: p.canceled,
        acceptance_rate: Math.round(p.conversionRate * 1000) / 10,
        completion_rate: Math.round(p.completionRate * 1000) / 10,
      }));
    } else {
      rows = data.byMonth.map((m) => ({
        period: m.month,
        proposed: m.proposed,
        accepted: m.accepted,
        completed: m.completed,
        canceled: m.canceled,
        acceptance_rate: Math.round(m.conversionRate * 1000) / 10,
        completion_rate: Math.round(m.completionRate * 1000) / 10,
      }));
    }

    return NextResponse.json({ rows, summary });
  } catch (e) {
    console.error("GET /api/reports/plan-conversion error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
