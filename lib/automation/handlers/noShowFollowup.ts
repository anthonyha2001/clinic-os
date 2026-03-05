import { pgClient } from "@/db/index";
import { sendWhatsApp } from "@/lib/whatsapp/send";

export async function sendNoShowFollowups(orgId?: string) {
  // Find appointments that ended 1+ hours ago, status is no_show, 
  // and no followup sent yet
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const appointments = await pgClient`
    SELECT
      a.id, a.start_time, a.end_time, a.patient_id, a.organization_id,
      p.first_name, p.last_name, p.phone,
      u.full_name AS provider_name,
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
    WHERE a.status = 'no_show'
      AND a.start_time <= ${oneHourAgo.toISOString()}
      AND a.start_time >= ${twentyFourHoursAgo.toISOString()}
      AND a.noshow_sent_at IS NULL
      AND p.phone IS NOT NULL
      ${orgId ? pgClient` AND a.organization_id = ${orgId}` : pgClient``}
    ORDER BY a.start_time ASC
  `;

  let sent = 0;
  let failed = 0;

  for (const appt of appointments) {
    const apptDate = new Date(appt.start_time);
    const timeStr = apptDate.toLocaleTimeString("en", {
      hour: "2-digit", minute: "2-digit",
    });

    const bookingLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com"}/book/${appt.clinic_slug}`;

    const message = `Hello ${appt.first_name}, 

We noticed you missed your appointment today at *${timeStr}* with Dr. ${appt.provider_name} at *${appt.clinic_name}*.

We hope everything is okay! 🙏

Would you like to reschedule? Book a new appointment here:
👉 ${bookingLink}

We look forward to seeing you soon!
_${appt.clinic_name}_${appt.clinic_phone ? `\n📞 ${appt.clinic_phone}` : ""}`;

    const result = await sendWhatsApp({
      to: appt.phone,
      message,
      orgId: appt.organization_id,
    });

    if (result.success) {
      await pgClient`
        UPDATE appointments
        SET noshow_sent_at = now(), updated_at = now()
        WHERE id = ${appt.id}
      `;

      await pgClient`
        INSERT INTO automation_events (
          organization_id, event_type, entity_type, entity_id,
          patient_id, payload, status, scheduled_for
        ) VALUES (
          ${appt.organization_id},
          'no_show_followup',
          'appointment',
          ${appt.id},
          ${appt.patient_id},
          ${JSON.stringify({ phone: appt.phone, message_id: result.messageId })},
          'completed',
          ${new Date().toISOString()}
        )
      `;
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed, total: appointments.length };
}

// Handle single event from queue (kept for backward compat)
export async function handleNoShowFollowup(payload: Record<string, unknown>) {
  const appointmentId = payload.appointment_id as string;

  const [appt] = await pgClient`
    SELECT
      a.id, a.start_time, a.status, a.patient_id, a.organization_id,
      a.noshow_sent_at,
      p.first_name, p.phone,
      u.full_name AS provider_name,
      s.name_en AS service_name,
      org.name AS clinic_name, org.slug AS clinic_slug, org.phone AS clinic_phone
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN provider_profiles pp ON pp.id = a.provider_id
    JOIN users u ON u.id = pp.user_id
    LEFT JOIN appointment_lines al ON al.appointment_id = a.id
    LEFT JOIN services s ON s.id = al.service_id
    JOIN organizations org ON org.id = a.organization_id
    WHERE a.id = ${appointmentId}
    LIMIT 1
  `;

  if (!appt || appt.status !== "no_show" || appt.noshow_sent_at) {
    return { skipped: true };
  }

  const bookingLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com"}/book/${appt.clinic_slug}`;
  const timeStr = new Date(appt.start_time).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });

  const message = `Hello ${appt.first_name}, we noticed you missed your appointment today at *${timeStr}* with Dr. ${appt.provider_name} at *${appt.clinic_name}*.\n\nWould you like to reschedule?\n👉 ${bookingLink}`;

  const result = await sendWhatsApp({ to: appt.phone, message, orgId: appt.organization_id });

  if (result.success) {
    await pgClient`UPDATE appointments SET noshow_sent_at = now() WHERE id = ${appt.id}`;
  }

  return { success: result.success, phone: appt.phone };
}