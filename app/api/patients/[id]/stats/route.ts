import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (_request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json(
        { error: "Patient ID required" },
        { status: 400 }
      );
    }

    const [patient] = await pgClient`
      SELECT id FROM patients WHERE id = ${id} AND organization_id = ${user.organizationId}
    `;
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const [apptStats] = await pgClient`
      SELECT
        COUNT(*)::int AS total_appointments,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_appointments,
        MAX(start_time) AS last_visit
      FROM appointments
      WHERE patient_id = ${id} AND organization_id = ${user.organizationId}
    `;

    const [invoiceStats] = await pgClient`
      SELECT
        COALESCE(SUM(i.total), 0)::numeric(12,2) AS total_invoiced,
        COALESCE(SUM(pa.amount), 0)::numeric(12,2) AS total_paid
      FROM invoices i
      LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
      WHERE i.patient_id = ${id}
        AND i.organization_id = ${user.organizationId}
        AND i.status != 'voided'
    `;

    const [unpaidRow] = await pgClient`
      SELECT (COALESCE(SUM(i.total), 0) - COALESCE(SUM(pa.amount), 0))::numeric(12,2) AS balance
      FROM invoices i
      LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
      WHERE i.patient_id = ${id}
        AND i.organization_id = ${user.organizationId}
        AND i.status NOT IN ('voided', 'paid')
    `;

    const [planStats] = await pgClient`
      SELECT COUNT(*)::int AS active_plans
      FROM plans
      WHERE patient_id = ${id}
        AND organization_id = ${user.organizationId}
        AND status IN ('proposed', 'accepted', 'in_progress')
    `;

    const totalPaid = Number(invoiceStats?.total_paid ?? 0);
    const unpaidBalance = Number((unpaidRow as { balance: string } | undefined)?.balance ?? 0);

    return NextResponse.json({
      stats: {
        total_spent: totalPaid,
        total_appointments: Number(apptStats?.total_appointments ?? 0),
        completed_appointments: Number(apptStats?.completed_appointments ?? 0),
        active_plans: Number(planStats?.active_plans ?? 0),
        unpaid_balance: unpaidBalance,
        last_visit: apptStats.last_visit
          ? typeof apptStats.last_visit === "string"
            ? apptStats.last_visit
            : (apptStats.last_visit as Date).toISOString()
          : null,
      },
    });
  } catch (e) {
    console.error("GET /api/patients/[id]/stats error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
