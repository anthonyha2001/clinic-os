import { pgClient } from "@/db/index";
import { sendWhatsApp } from "@/lib/whatsapp/send";

export async function sendAppointmentReminders(orgId?: string) {
  // Find appointments starting in 20-28 hours that haven't been reminded yet
  const tomorrow = new Date(Date.now() + 20 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(Date.now() + 28 * 60 * 60 * 1000);

  const appointments = await pgClient`
    SELECT
      a.id, a.start_time, a.patient_id, a.organization_id,
      p.first_name, p.last_name, p.phone,
      u.full_name AS provider_name,
      pp.specialty_en AS provider_specialty,
      s.name_en AS service_name,
      org.name AS clinic_name,
      org.phone AS clinic_phone,
      org.slug AS clinic_slug
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN provider_profiles pp ON pp.id = a.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN appointment_lines al ON al.appointment_id = a.id
    LEFT JOIN services s ON s.id = al.service_id
    JOIN organizations org ON org.id = a.organization_id
    WHERE a.start_time >= ${tomorrow.toISOString()}
      AND a.start_time <= ${tomorrowEnd.toISOString()}
      AND a.status IN ('scheduled', 'confirmed')
      AND a.reminder_sent_at IS NULL
      AND p.phone IS NOT NULL
      ${orgId ? pgClient` AND a.organization_id = ${orgId}` : pgClient``}
    ORDER BY a.start_time ASC
  `;

  let sent = 0;
  let failed = 0;

  for (const appt of appointments) {
    const apptDate = new Date(appt.start_time);
    const dateStr = apptDate.toLocaleDateString("en", {
      weekday: "long", month: "long", day: "numeric",
    });
    const timeStr = apptDate.toLocaleTimeString("en", {
      hour: "2-digit", minute: "2-digit",
    });

    const bookingLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com"}/book/${appt.clinic_slug}`;

    const message = `Hello ${appt.first_name}! 👋

This is a reminder from *${appt.clinic_name}*.

📅 You have an appointment *tomorrow*:
- Date: ${dateStr}
- Time: ${timeStr}
- Service: ${appt.service_name ?? "Dental Appointment"}
- Doctor: Dr. ${appt.provider_name}

Please arrive 5 minutes early. If you need to reschedule, you can do so here:
${bookingLink}

See you tomorrow! 😊
_${appt.clinic_name}_${appt.clinic_phone ? `\n📞 ${appt.clinic_phone}` : ""}`;

    const result = await sendWhatsApp({
      to: appt.phone,
      message,
      orgId: appt.organization_id,
    });

    if (result.success) {
      // Mark reminder as sent
      await pgClient`
        UPDATE appointments
        SET reminder_sent_at = now(), updated_at = now()
        WHERE id = ${appt.id}
      `;

      // Log to automation_events
      await pgClient`
        INSERT INTO automation_events (
          organization_id, event_type, entity_type, entity_id,
          patient_id, payload, status, scheduled_for
        ) VALUES (
          ${appt.organization_id},
          'appointment_reminder',
          'appointment',
          ${appt.id},
          ${appt.patient_id},
          ${JSON.stringify({ phone: appt.phone, message_id: result.messageId, sent_at: new Date().toISOString() })},
          'completed',
          ${new Date().toISOString()}
        )
      `;
      sent++;
    } else {
      await pgClient`
        INSERT INTO automation_events (
          organization_id, event_type, entity_type, entity_id,
          patient_id, payload, status, scheduled_for, error_message
        ) VALUES (
          ${appt.organization_id},
          'appointment_reminder',
          'appointment',
          ${appt.id},
          ${appt.patient_id},
          ${JSON.stringify({ phone: appt.phone })},
          'failed',
          ${new Date().toISOString()},
          ${result.error ?? "Unknown error"}
        )
      `;
      failed++;
    }
  }

  return { sent, failed, total: appointments.length };
}