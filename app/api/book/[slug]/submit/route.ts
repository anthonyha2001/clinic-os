import { NextRequest, NextResponse } from "next/server";
import { pgClient } from "@/db/index";

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const body = await request.json();
    const {
      patient_name, patient_phone, patient_email,
      provider_id, service_id, date, time, notes,
    } = body;

    if (!patient_name || !patient_phone || !provider_id || !service_id || !date || !time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 422 });
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
    const endTime = new Date(startTime.getTime() + service.default_duration_minutes * 60000);

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

    return NextResponse.json({
      ok: true,
      appointment_id: appointment.id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    }, { status: 201 });

  } catch (e) {
    console.error("Booking submit error:", e);
    return NextResponse.json({ error: "Booking failed. Please try again." }, { status: 500 });
  }
}
