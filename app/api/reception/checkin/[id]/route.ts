import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";

export const PATCH = withAuth(async (request, { user, params }) => {
  const id = params?.id as string;
  const body = await request.json();
  const status = body?.status;

  const validStatuses = ["waiting", "in_chair", "done", "skipped"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 422 });
  }

  const [updated] = await pgClient`
    UPDATE appointment_checkins
    SET
      status = ${status},
      called_in_at = CASE WHEN ${status} = 'in_chair' AND called_in_at IS NULL
                    THEN now() ELSE called_in_at END,
      updated_at = now()
    WHERE id = ${id} AND organization_id = ${user.organizationId}
    RETURNING *
  `;

  if (!updated)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // When marked done → complete the appointment → triggers auto-invoice
  if (status === "done") {
    const appointmentId = updated.appointment_id as string;

    // Mark appointment as completed
    await pgClient`
      UPDATE appointments
      SET status = 'completed', updated_at = now()
      WHERE id = ${appointmentId}
        AND organization_id = ${user.organizationId}
        AND status NOT IN ('completed', 'canceled', 'no_show')
    `;

    // Auto-create invoice (same logic as status route)
    try {
      const { createInvoice } = await import("@/lib/services/invoices/create");

      const apptLines = await pgClient`
        SELECT
          al.service_id, al.plan_item_id, al.quantity,
          s.name_en, s.name_fr, s.name_ar, s.price AS service_price,
          pi.unit_price AS plan_unit_price,
          pi.quantity_completed, pi.quantity_total,
          a.patient_id, a.organization_id
        FROM appointment_lines al
        JOIN appointments a ON a.id = al.appointment_id
        JOIN services s ON s.id = al.service_id
        LEFT JOIN plan_items pi ON pi.id = al.plan_item_id
        WHERE al.appointment_id = ${appointmentId}
          AND al.organization_id = ${user.organizationId}
        ORDER BY al.sequence_order ASC
      `;

      if (apptLines.length > 0) {
        const first = apptLines[0];

        // Increment plan sessions if linked
        for (const line of apptLines) {
          if (line.plan_item_id) {
            await pgClient`
              UPDATE plan_items
              SET quantity_completed = LEAST(quantity_completed + 1, quantity_total),
                  updated_at = now()
              WHERE id = ${line.plan_item_id}
            `;
          }
        }

        // Check for duplicate invoice
        const [existingInvoice] = await pgClient`
          SELECT id FROM invoices
          WHERE appointment_id = ${appointmentId}
            AND organization_id = ${user.organizationId}
          LIMIT 1
        `;

        let invoiceId: string | null = null;

        if (!existingInvoice) {
          const lines = apptLines.map((line: Record<string, unknown>) => {
            const isPlanLinked = line.plan_item_id != null;
            const completed = Number(line.quantity_completed ?? 0);
            const total = Number(line.quantity_total ?? 1);
            const suffix = isPlanLinked
              ? ` — Session ${completed + 1}/${total}`
              : "";
            return {
              serviceId: line.service_id as string,
              planItemId: (line.plan_item_id as string | null) ?? null,
              descriptionEn: `${line.name_en}${suffix}`,
              descriptionFr: `${line.name_fr}${suffix}`,
              descriptionAr: `${line.name_ar}${suffix}`,
              quantity: Number(line.quantity),
              unitPrice: Number(
                line.plan_item_id
                  ? (line.plan_unit_price ?? line.service_price)
                  : line.service_price
              ),
            };
          });

          const invoice = await createInvoice({
            orgId: user.organizationId,
            patientId: first.patient_id as string,
            appointmentId,
            createdBy: user.id,
            lines,
            notes: null,
          });

          invoiceId = (invoice as Record<string, unknown>).id as string;
        } else {
          invoiceId = existingInvoice.id as string;
        }

        return NextResponse.json({
          ...updated,
          invoice_created: !existingInvoice,
          invoice_id: invoiceId,
        });
      }
    } catch (e) {
      console.error("Auto-invoice from reception failed:", e);
      // Don't fail the checkin update
    }
  }

  return NextResponse.json(updated);
});
