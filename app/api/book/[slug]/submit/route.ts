import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pgClient } from "@/db/index";
import { rateLimit } from "@/lib/rateLimit";

const submitBookingSchema = z.object({
  patient_name: z.string().min(1).max(100).trim(),
  patient_phone: z.string().min(5).max(30).trim(),
  patient_email: z
    .union([z.string().email().max(255), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  provider_id: z.string().uuid(),
  service_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const allowed = rateLimit(ip, 5, 60_000); // 5 submissions per minute per IP
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = submitBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid booking data", details: parsed.error.issues },
        { status: 422 }
      );
    }
    const {
      patient_name,
      patient_phone,
      patient_email,
      provider_id,
      service_id,
      date,
      time,
      notes,
    } = parsed.data;

    const bookingDate = new Date(`${date}T${time}:00`);
    const now = new Date();
    const ninetyDaysFromNow = new Date(
      now.getTime() + 90 * 24 * 60 * 60 * 1000
    );
    if (bookingDate < now) {
      return NextResponse.json(
        { error: "Cannot book in the past" },
        { status: 422 }
      );
    }
    if (bookingDate > ninetyDaysFromNow) {
      return NextResponse.json(
        { error: "Cannot book more than 90 days ahead" },
        { status: 422 }
      );
    }

    const [org] = await pgClient`
      SELECT id, timezone FROM organizations
      WHERE slug = ${params.slug}
        AND booking_enabled = true
      LIMIT 1
    `;
    if (!org) return NextResponse.json({ error: "Booking unavailable" }, { status: 404 });

    const [service] = await pgClient`
      SELECT id, default_duration_minutes FROM services
      WHERE id = ${service_id}
        AND organization_id = ${org.id}
        AND is_active = true
    `;
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    const startTime = new Date(`${date}T${time}:00`);
    const endTime = new Date(
      startTime.getTime() + service.default_duration_minutes * 60000
    );

    // Check no conflict
    const [conflict] = await pgClient`
      SELECT id FROM appointments
      WHERE organization_id = ${org.id}
        AND provider_id = ${provider_id}
        AND status NOT IN ('canceled','no_show')
        AND start_time < ${endTime.toISOString()}
        AND end_time > ${startTime.toISOString()}
      LIMIT 1
    `;
    if (conflict) {
      return NextResponse.json(
        { error: "This slot is no longer available. Please choose another time." },
        { status: 409 }
      );
    }

    // Find or create patient
    const nameParts = patient_name.trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || "-";

    let patientId: string;
    const [existing] = await pgClient`
      SELECT id FROM patients
      WHERE organization_id = ${org.id}
        AND phone = ${patient_phone}
      LIMIT 1
    `;

    if (existing) {
      patientId = existing.id;
    } else {
      const [created] = await pgClient`
        INSERT INTO patients (organization_id, first_name, last_name, phone, email, preferred_locale)
        VALUES (${org.id}, ${firstName}, ${lastName}, ${patient_phone}, ${patient_email ?? null}, 'en')
        RETURNING id
      `;
      patientId = created.id;
    }

    // Get admin user as created_by
    const [systemUser] = await pgClient`
      SELECT u.id FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE u.organization_id = ${org.id}
        AND r.name = 'admin'
      LIMIT 1
    `;
    if (!systemUser) {
      return NextResponse.json({ error: "Clinic setup incomplete" }, { status: 500 });
    }

    // Create appointment
    const [appointment] = await pgClient`
      INSERT INTO appointments (
        organization_id, patient_id, provider_id,
        start_time, end_time, status, notes, created_by
      )
      VALUES (
        ${org.id}, ${patientId}, ${provider_id},
        ${startTime.toISOString()}, ${endTime.toISOString()},
        'scheduled', ${notes ?? null}, ${systemUser.id}
      )
      RETURNING id
    `;

    // Create appointment line
    await pgClient`
      INSERT INTO appointment_lines (
        appointment_id, organization_id, service_id,
        quantity, unit_price, duration_minutes
      )
      SELECT
        ${appointment.id},
        ${org.id},
        id,
        1,
        price,
        default_duration_minutes
      FROM services
      WHERE id = ${service_id}
    `;

    // Log booking request for notification center
    await pgClient`
      INSERT INTO booking_requests (
        organization_id, appointment_id, patient_id,
        service_id, provider_id, requested_date, requested_time,
        patient_name, patient_phone, patient_email, notes, status
      ) VALUES (
        ${org.id}, ${appointment.id}, ${patientId},
        ${service_id}, ${provider_id}, ${date}::date, ${time},
        ${patient_name}, ${patient_phone}, ${patient_email ?? null},
        ${notes ?? null}, 'confirmed'
      )
    `;

    return NextResponse.json({
      ok: true,
      appointment_id: appointment.id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    }, { status: 201 });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Booking submit error:", e instanceof Error ? e.message : "Unknown");
    }
    return NextResponse.json(
      { error: "Booking failed. Please try again." },
      { status: 500 }
    );
  }
}
