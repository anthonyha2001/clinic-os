import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { pgClient } from "@/db/index";
import { updateAppointmentSchema } from "@/lib/validations/appointment";
import { updateAppointment } from "@/lib/services/appointments/update";
import { notifyScheduleChange } from "@/lib/notifications/notifyScheduleChange";

export const GET = withAuth(async (_request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "Appointment ID required" }, { status: 400 });
    }

    const orgId = user.organizationId;
    const [row] = await pgClient`
      SELECT
        a.*,
        p.first_name AS patient_first_name,
        p.last_name AS patient_last_name,
        p.phone AS patient_phone,
        p.email AS patient_email,
        pp.id AS provider_profile_id,
        pp.color_hex AS provider_color_hex,
        u.full_name AS provider_full_name,
        s.name_en AS service_name_en,
        i.id AS invoice_id,
        i.invoice_number
      FROM appointments a
      JOIN patients p ON p.id = a.patient_id
      JOIN provider_profiles pp ON pp.id = a.provider_id
      JOIN users u ON u.id = pp.user_id
      LEFT JOIN appointment_lines al ON al.appointment_id = a.id
      LEFT JOIN services s ON s.id = al.service_id
      LEFT JOIN invoices i ON i.appointment_id = a.id
      WHERE a.id = ${id}
        AND a.organization_id = ${orgId}
      LIMIT 1
    `;

    if (!row) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    const r = row as Record<string, unknown>;
    const appointment = {
      ...r,
      id: r.id,
      patient_id: r.patient_id,
      provider_id: r.provider_id,
      start_time: r.start_time,
      end_time: r.end_time,
      status: r.status,
      patient: {
        first_name: r.patient_first_name,
        last_name: r.patient_last_name,
        phone: r.patient_phone,
        email: r.patient_email,
      },
      provider: {
        id: r.provider_id,
        color_hex: r.provider_color_hex,
        full_name: r.provider_full_name,
        user: { full_name: r.provider_full_name },
      },
      service: r.service_name_en ? { name_en: r.service_name_en } : null,
      invoice_id: r.invoice_id ?? null,
      invoice_number: r.invoice_number ?? null,
    };

    return NextResponse.json({ appointment });
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number };
    console.error("GET /api/appointments/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});

export const PATCH = withAuth(async (request, { user, params }) => {
  try {
    const id = params?.id as string | undefined;
    if (!id) {
      return NextResponse.json(
        { error: "Appointment ID required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateAppointmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 422 }
      );
    }

    const data: {
      start_time?: string;
      end_time?: string;
      provider_id?: string;
      notes?: string | null;
    } = {};
    if (parsed.data.start_time != null) data.start_time = parsed.data.start_time;
    if (parsed.data.end_time != null)   data.end_time   = parsed.data.end_time;
    if (parsed.data.provider_id != null) data.provider_id = parsed.data.provider_id;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

    // Fetch old start_time before updating so we can show "was → now" in notification
    const [existing] = await pgClient`
      SELECT start_time FROM appointments
      WHERE id = ${id} AND organization_id = ${user.organizationId}
      LIMIT 1
    `;

    const appointment = await updateAppointment({
      appointmentId: id,
      orgId: user.organizationId,
      changedBy: user.id,
      data,
    });

    // Fire schedule-change notification only when the time actually changed
    if (data.start_time && existing) {
      notifyScheduleChange({
        organizationId: user.organizationId,
        appointmentId: id,
        oldStartTime: existing.start_time as string,
        newStartTime: data.start_time,
        newEndTime: data.end_time ?? data.start_time,
        changedByUserId: user.id,
      }).catch(() => {});
    }

    return NextResponse.json(appointment);
  } catch (e: unknown) {
    const err = e as Error & { statusCode?: number; details?: unknown };
    const statusCode = err.statusCode ?? 500;

    if (statusCode === 404) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (statusCode === 409) {
      return NextResponse.json(
        { error: err.message, conflict: true, details: err.details },
        { status: 409 }
      );
    }
    if (statusCode === 422) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }

    console.error("PATCH /api/appointments/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});