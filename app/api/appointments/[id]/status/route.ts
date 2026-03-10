import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
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

    if (newStatus === "completed") {
      try {
        const { onAppointmentCompleted } = await import("@/lib/services/appointments/onCompleted");
        await onAppointmentCompleted(id);
      } catch (completionErr) {
        // Don't fail the status update if post-completion tasks fail
        console.error("Post-completion tasks failed:", completionErr);
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
