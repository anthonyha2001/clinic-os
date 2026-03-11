import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (_req, { user }) => {
  try {
    const rows = await pgClient`
      SELECT
        p.id                                              AS plan_id,
        p.name_en                                         AS plan_name,
        p.status                                          AS plan_status,
        pt.id                                             AS patient_id,
        pt.first_name || ' ' || pt.last_name             AS patient_name,
        pt.phone                                          AS patient_phone,
        pi.id                                             AS item_id,
        COALESCE(pi.description_en, s.name_en, 'Treatment') AS item_name,
        pi.quantity_total                                 AS qty_total,
        pi.quantity_completed                             AS qty_done,
        (pi.quantity_total - pi.quantity_completed)       AS qty_remaining,
        pi.unit_price,
        (pi.quantity_total - pi.quantity_completed)
          * pi.unit_price                                 AS remaining_value,
        u_provider.full_name                              AS provider_name,
        -- last completed appointment for this patient
        MAX(a.start_time) FILTER (
          WHERE a.status = 'completed'
        )                                                 AS last_visit,
        -- last completed appointment for this specific plan item
        MAX(a.start_time) FILTER (
          WHERE a.plan_item_id = pi.id AND a.status = 'completed'
        )                                                 AS item_last_visit
      FROM plan_items pi
      JOIN plans p          ON p.id  = pi.plan_id
      JOIN patients pt       ON pt.id = p.patient_id
      JOIN provider_profiles pp      ON pp.id = p.provider_id
      JOIN users u_provider  ON u_provider.id = pp.user_id
      LEFT JOIN services s   ON s.id  = pi.service_id
      LEFT JOIN appointments a
        ON a.patient_id = pt.id
        AND a.organization_id = ${user.organizationId}
        AND a.deleted_at IS NULL
      WHERE p.organization_id = ${user.organizationId}
        AND p.status IN ('accepted', 'in_progress')
        AND pi.quantity_completed < pi.quantity_total
        AND pt.deleted_at IS NULL
      GROUP BY
        p.id, p.name_en, p.status,
        pt.id, pt.first_name, pt.last_name, pt.phone,
        pi.id, pi.description_en, s.name_en,
        pi.quantity_total, pi.quantity_completed, pi.unit_price,
        u_provider.full_name
      ORDER BY remaining_value DESC, last_visit ASC NULLS FIRST
    `;

    // Group by patient
    const byPatient = new Map<string, {
      patient_id: string;
      patient_name: string;
      patient_phone: string;
      provider_name: string;
      last_visit: string | null;
      total_remaining_value: number;
      items: {
        item_id: string;
        item_name: string;
        plan_name: string;
        qty_remaining: number;
        unit_price: number;
        remaining_value: number;
        item_last_visit: string | null;
      }[];
    }>();

    for (const r of rows) {
      const key = r.patient_id as string;
      if (!byPatient.has(key)) {
        byPatient.set(key, {
          patient_id: key,
          patient_name: r.patient_name as string,
          patient_phone: r.patient_phone as string,
          provider_name: r.provider_name as string,
          last_visit: r.last_visit as string | null,
          total_remaining_value: 0,
          items: [],
        });
      }
      const entry = byPatient.get(key)!;
      const remainingValue = Number(r.remaining_value ?? 0);
      entry.total_remaining_value += remainingValue;
      entry.items.push({
        item_id: r.item_id as string,
        item_name: r.item_name as string,
        plan_name: r.plan_name as string,
        qty_remaining: Number(r.qty_remaining),
        unit_price: Number(r.unit_price),
        remaining_value: remainingValue,
        item_last_visit: r.item_last_visit as string | null,
      });
    }

    const patients = Array.from(byPatient.values()).sort(
      (a, b) => b.total_remaining_value - a.total_remaining_value
    );

    const totalValue = patients.reduce(
      (sum, p) => sum + p.total_remaining_value, 0
    );

    return NextResponse.json({
      patients,
      summary: {
        total_patients: patients.length,
        total_remaining_value: totalValue,
        total_items: rows.length,
      },
    });
  } catch (e) {
    console.error("GET /api/reports/untreated-plans error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});