import { NextRequest, NextResponse } from "next/server";
import { pgClient } from "@/db/index";
import { notifyNewAppointment } from "@/lib/notifications/notifyNewAppointment";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
  const {
    patient_name, patient_phone, patient_email,
    provider_id, service_id, date, time, notes,
  } = body;

  // Validate
  if (!patient_name || !patient_phone || !provider_id || !service_id || !date || !time) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
  }

  const [org] = await pgClient`
    SELECT id, timezone FROM organizations
    WHERE slug = ${slug} AND booking_enabled = true
    LIMIT 1
  `;
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get service duration
  const [service] = await pgClient`
    SELECT id, default_duration_minutes FROM services
    WHERE id = ${service_id} AND organization_id = ${org.id}
  `;
  if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

  // Build start/end times
  const startTime = new Date(`${date}T${time}:00`);
  const endTime = new Date(startTime.getTime() + service.default_duration_minutes * 60000);

  // Check slot still available
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
    return NextResponse.json({ error: "This slot is no longer available. Please choose another time." }, { status: 409 });
  }

  // Find or create patient
  const nameParts = patient_name.trim().split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || "-";

  let patient;
  const [existing] = await pgClient`
    SELECT id FROM patients
    WHERE organization_id = ${org.id}
      AND phone = ${patient_phone}
    LIMIT 1
  `;

  if (existing) {
    patient = existing;
  } else {
    [patient] = await pgClient`
      INSERT INTO patients (organization_id, first_name, last_name, phone, email, preferred_locale)
      VALUES (${org.id}, ${firstName}, ${lastName}, ${patient_phone}, ${patient_email ?? null}, 'en')
      RETURNING id
    `;
  }

  if (!patient) {
    return NextResponse.json({ error: "Failed to create patient" }, { status: 500 });
  }

  const [systemUser] = await pgClient`
    SELECT u.id FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.organization_id = ${org.id}
      AND r.name IN ('admin', 'manager', 'provider')
    LIMIT 1
  `;

  let createdBy = systemUser?.id ?? null;
  if (!createdBy) {
    const [anyUser] = await pgClient`
      SELECT id FROM users
      WHERE organization_id = ${org.id}
      LIMIT 1
    `;
    createdBy = anyUser?.id ?? null;
  }

  if (!createdBy) {
    return NextResponse.json({ error: "Organization setup incomplete" }, { status: 500 });
  }

  const [appointment] = await pgClient`
    INSERT INTO appointments (
      organization_id, patient_id, provider_id,
      start_time, end_time, status, notes, created_by
    )
    VALUES (
      ${org.id}, ${patient.id}, ${provider_id},
      ${startTime.toISOString()}, ${endTime.toISOString()},
      'scheduled', ${notes ?? null}, ${createdBy}
    )
    RETURNING id
  `;

  // Create appointment line
  await pgClient`
    INSERT INTO appointment_lines (appointment_id, service_id, quantity, unit_price)
    SELECT ${appointment.id}, ${service_id}, 1, price
    FROM services WHERE id = ${service_id}
  `;

  notifyNewAppointment({
    organizationId: org.id,
    appointmentId: appointment.id,
    patientId: patient.id,
    providerId: provider_id,
    startTime,
    endTime,
    patientName: patient_name,
  }).catch(() => {});

  // Log booking request
  await pgClient`
    INSERT INTO booking_requests (
      organization_id, appointment_id, patient_id,
      service_id, provider_id, requested_date, requested_time,
      patient_name, patient_phone, patient_email, notes, status
    ) VALUES (
      ${org.id}, ${appointment.id}, ${patient.id},
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
    console.error("Booking submit error:", e);
    return NextResponse.json(
      { error: "Booking failed", details: String(e) },
      { status: 500 }
    );
  }
}