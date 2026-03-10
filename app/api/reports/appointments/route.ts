import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { getAppointmentsReport } from "@/lib/services/reports/appointments";

const querySchema = z.object({
  start_date: z.string().min(1),
  end_date: z.string().min(1),
});

function toDatetime(dateStr: string, endOfDay: boolean): string {
  if (dateStr.length === 10) {
    return endOfDay ? `${dateStr}T23:59:59.999Z` : `${dateStr}T00:00:00.000Z`;
  }
  return dateStr;
}

export const GET = withAuth(
  { permissions: ["reports.view"] },
  async (request, { user }) => {
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

      const startDate = toDatetime(parsed.data.start_date, false);
      const endDate = toDatetime(parsed.data.end_date, true);
      if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
        return NextResponse.json(
          { error: "end_date must be greater than start_date" },
          { status: 422 }
        );
      }

      const [orgRow] = await pgClient`
        SELECT timezone FROM organizations WHERE id = ${user.organizationId} LIMIT 1
      `;
      const timezone = String(orgRow?.timezone ?? "Asia/Beirut");

      const data = await getAppointmentsReport({
        orgId: user.organizationId,
        startDate,
        endDate,
        timezone,
      });

      return NextResponse.json(data);
    } catch (e) {
      console.error("GET /api/reports/appointments error:", e);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);
