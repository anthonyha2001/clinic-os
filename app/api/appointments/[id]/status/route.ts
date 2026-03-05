import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { createInvoice } from "@/lib/services/invoices/create";
import { updateAppointmentStatusSchema } from "@/lib/validations/appointment";
import { updateAppointmentStatus } from "@/lib/services/appointments/updateStatus";

export const POST = withAuth(async (request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json(
        { error: "Appointment ID required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateAppointmentStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const newStatus = parsed.data.status;
    const appointment = await updateAppointmentStatus({
      appointmentId: id,
      newStatus,
      changedBy: user.id,
      reason: parsed.data.reason ?? null,
      orgId: user.organizationId,
    });

    // Auto-invoice + plan session increment when appointment completed
    if (newStatus === "completed") {
      const appt = appointment as unknown as Record<string, unknown>;
      const planItemId =
        typeof appt.plan_item_id === "string" ? appt.plan_item_id : null;
      const appointmentId = typeof appt.id === "string" ? appt.id : null;
      const organizationId =
        typeof appt.organization_id === "string" ? appt.organization_id : null;
      const patientId = typeof appt.patient_id === "string" ? appt.patient_id : null;
      // 1. Increment plan item session count if linked
      if (planItemId) {
        await pgClient`
          UPDATE plan_items
          SET quantity_completed = LEAST(quantity_completed + 1, quantity_total),
              updated_at = now()
          WHERE id = ${planItemId}
        `;

        // Auto-advance plan to in_progress if it was accepted
        await pgClient`
          UPDATE plans SET status = 'in_progress', updated_at = now()
          WHERE id = (SELECT plan_id FROM plan_items WHERE id = ${planItemId})
            AND status = 'accepted'
        `;

        // Check if all items done → complete the plan
        const [planCheck] = await pgClient`
          SELECT plan_id,
            COUNT(*) FILTER (WHERE quantity_completed < quantity_total) AS remaining
          FROM plan_items
          WHERE plan_id = (SELECT plan_id FROM plan_items WHERE id = ${planItemId})
          GROUP BY plan_id
        `;
        if (planCheck && Number(planCheck.remaining) === 0) {
          await pgClient`
            UPDATE plans SET status = 'completed', completed_at = now(), updated_at = now()
            WHERE id = ${planCheck.plan_id} AND status = 'in_progress'
          `;
        }
      }

      // 2. Auto-create invoice for this session
      try {
        const apptLines = await pgClient`
          SELECT
            al.service_id, al.plan_item_id, al.quantity,
            s.name_en, s.name_fr, s.name_ar, s.price AS service_price,
            pi.unit_price AS plan_unit_price,
            pi.quantity_completed, pi.quantity_total
          FROM appointment_lines al
          JOIN services s ON s.id = al.service_id
          LEFT JOIN plan_items pi ON pi.id = al.plan_item_id
          WHERE al.appointment_id = ${appointmentId}
            AND al.organization_id = ${organizationId}
          ORDER BY al.sequence_order ASC
        `;

        if (apptLines.length > 0 && appointmentId && organizationId && patientId) {
          const lines = apptLines.map((line: Record<string, unknown>) => {
            const isPlanLinked = line.plan_item_id != null;
            const suffix = isPlanLinked
              ? ` — Session ${line.quantity_completed}/${line.quantity_total}`
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

          await createInvoice({
            orgId: organizationId,
            patientId: patientId,
            appointmentId: appointmentId,
            createdBy: user.id,
            lines,
            notes: null,
          });
        }
      } catch (invoiceErr) {
        // Don't fail the status update if invoice creation fails
        console.error("Auto-invoice failed:", invoiceErr);
      }
    }

    // Queue no-show followup 1 hour later
    if (newStatus === "no_show") {
      const { queueEvent } = await import("@/lib/automation/queue");
      const appt = appointment as unknown as Record<string, unknown>;
      const organizationId =
        typeof appt.organization_id === "string" ? appt.organization_id : null;
      const appointmentId = typeof appt.id === "string" ? appt.id : null;
      const patientId = typeof appt.patient_id === "string" ? appt.patient_id : null;
      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000);
      if (organizationId && appointmentId && patientId) {
        await queueEvent({
          orgId: organizationId,
          eventType: "no_show_followup",
          entityType: "appointment",
          entityId: appointmentId,
          patientId: patientId,
          payload: { appointment_id: appointmentId },
          scheduledFor,
        });
      }
    }

    return NextResponse.json(appointment);
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("POST /api/appointments/[id]/status error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
