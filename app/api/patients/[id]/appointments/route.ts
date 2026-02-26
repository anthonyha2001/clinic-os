import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const GET = withAuth(async (_request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Patient ID required" }, { status: 400 });
    }

    const rows = await pgClient`
      SELECT a.id, a.start_time, a.end_time, a.status, a.notes,
             pp.id as provider_id, u.full_name as provider_name,
             s.name_en as service_name, al.quantity, al.unit_price, al.duration_minutes
      FROM appointments a
      JOIN provider_profiles pp ON pp.id = a.provider_id
      JOIN users u ON u.id = pp.user_id
      LEFT JOIN appointment_lines al ON al.appointment_id = a.id
      LEFT JOIN services s ON s.id = al.service_id
      WHERE a.patient_id = ${id}
        AND a.organization_id = ${user.organizationId}
      ORDER BY a.start_time DESC
      LIMIT 50
    `;

    const byAppt = new Map<
      string,
      {
        id: string;
        startTime: string;
        endTime: string;
        status: string;
        notes: string | null;
        providerId: string;
        providerName: string;
        services: { name: string; quantity: number; unitPrice: string; durationMinutes: number }[];
      }
    >();

    for (const row of rows as unknown as Record<string, unknown>[]) {
      const apptId = row.id as string;
      if (!byAppt.has(apptId)) {
        byAppt.set(apptId, {
          id: apptId,
        startTime: typeof row.start_time === "string" ? row.start_time : (row.start_time as Date).toISOString(),
          endTime: typeof row.end_time === "string" ? row.end_time : (row.end_time as Date).toISOString(),
          status: row.status as string,
          notes: row.notes as string | null,
          providerId: row.provider_id as string,
          providerName: row.provider_name as string,
          services: [],
        });
      }
      const appt = byAppt.get(apptId)!;
      if (row.service_name && row.quantity != null && row.unit_price != null && row.duration_minutes != null) {
        appt.services.push({
          name: row.service_name as string,
          quantity: row.quantity as number,
          unitPrice: String(row.unit_price),
          durationMinutes: row.duration_minutes as number,
        });
      }
    }

    return NextResponse.json(Array.from(byAppt.values()));
  } catch (e) {
    console.error("GET /api/patients/[id]/appointments error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
