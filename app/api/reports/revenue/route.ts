import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { getRevenue } from "@/lib/services/reports/revenue";
import { getRevenueByProvider } from "@/lib/services/reports/revenueByProvider";
import { getRevenueByService } from "@/lib/services/reports/revenueByService";

const querySchema = z.object({
  group_by: z.enum(["day", "week", "month"]),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  provider_id: z.string().uuid().optional(),
  service_id: z.string().uuid().optional(),
});

function toDatetime(dateStr: string, endOfDay: boolean): string {
  if (dateStr.length === 10) {
    return endOfDay ? `${dateStr}T23:59:59.999Z` : `${dateStr}T00:00:00.000Z`;
  }
  return dateStr;
}

function formatPeriod(isoPeriod: string, groupBy: "day" | "week" | "month"): string {
  const d = new Date(isoPeriod);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (groupBy === "day") return `${y}-${m}-${day}`;
  if (groupBy === "month") return `${y}-${m}`;
  return `${y}-${m}-${day}`;
}

export const GET = withAuth(async (request, { user }) => {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      group_by: searchParams.get("group_by") ?? "month",
      start_date: searchParams.get("start_date"),
      end_date: searchParams.get("end_date"),
      provider_id: searchParams.get("provider_id") ?? undefined,
      service_id: searchParams.get("service_id") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const startDate = toDatetime(parsed.data.start_date, false);
    const endDate = toDatetime(parsed.data.end_date, true);
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (endMs <= startMs) {
      return NextResponse.json({ error: "end_date must be greater than start_date" }, { status: 422 });
    }
    const maxRangeMs = 365 * 24 * 60 * 60 * 1000;
    if (endMs - startMs > maxRangeMs) {
      return NextResponse.json({ error: "Date range cannot exceed 365 days" }, { status: 422 });
    }

    const [orgRow] = await pgClient`
      SELECT timezone FROM organizations WHERE id = ${user.organizationId} LIMIT 1
    `;
    const timezone = String(orgRow?.timezone ?? "Asia/Beirut");

    const [revenueData, byProvider, byService] = await Promise.all([
      getRevenue({
        orgId: user.organizationId,
        groupBy: parsed.data.group_by,
        startDate,
        endDate,
        providerId: parsed.data.provider_id,
        serviceId: parsed.data.service_id,
        timezone,
      }),
      getRevenueByProvider({
        orgId: user.organizationId,
        startDate,
        endDate,
      }),
      getRevenueByService({
        orgId: user.organizationId,
        startDate,
        endDate,
      }),
    ]);

    const periods = revenueData.byPeriod.map((p) => ({
      period: formatPeriod(p.period, parsed.data.group_by),
      total_revenue: p.totalRevenue,
      payment_count: p.paymentCount,
    }));

    const by_payment_method = revenueData.summary.breakdownByMethod.map((m) => ({
      method: m.label,
      total_revenue: m.amount,
    }));

    return NextResponse.json({
      periods,
      by_provider: byProvider.map((p) => ({
        provider_name: p.providerName,
        total_revenue: p.totalRevenue,
      })),
      by_service: byService.map((s) => ({
        service_name: s.serviceNameEn,
        total_revenue: s.totalRevenue,
      })),
      by_payment_method,
      summary: {
        total_revenue: revenueData.summary.totalRevenue,
        total_payments: revenueData.summary.paymentCount,
      },
    });
  } catch (e) {
    console.error("GET /api/reports/revenue error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
