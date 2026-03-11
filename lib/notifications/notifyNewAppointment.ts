import { pgClient } from "@/db/index";
import { notify } from "./notify";

export type NewAppointmentPayload = {
  organizationId: string;
  appointmentId: string;
  patientId: string;
  providerId: string;
  startTime: Date;
  endTime: Date;
  patientName?: string;
  providerName?: string;
};

export async function notifyNewAppointment(
  payload: NewAppointmentPayload
): Promise<void> {
  const { organizationId, appointmentId, providerId, startTime, endTime } = payload;

  try {
    // Fetch full details
    const [details] = await pgClient`
      SELECT
        p.first_name || ' ' || COALESCE(p.last_name, '') AS patient_name,
        COALESCE(u.full_name, 'Provider')                AS provider_name,
        u.id                                             AS provider_user_id,
        s.name_en                                        AS service_name,
        org.name                                         AS clinic_name
      FROM appointments a
      JOIN patients          p   ON p.id  = a.patient_id
      LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
      LEFT JOIN users        u   ON u.id  = pp.user_id
      LEFT JOIN appointment_lines al ON al.appointment_id = a.id
      LEFT JOIN services     s   ON s.id  = al.service_id
      JOIN organizations     org ON org.id = a.organization_id
      WHERE a.id = ${appointmentId}
      LIMIT 1
    `;

    const patientName  = payload.patientName  ?? (details?.patient_name  as string) ?? "Patient";
    const providerName = payload.providerName ?? (details?.provider_name as string) ?? "Provider";
    const serviceName  = (details?.service_name as string) ?? "Appointment";
    const clinicName   = (details?.clinic_name  as string) ?? "Clinic";
    const providerUserId = details?.provider_user_id as string | undefined;

    const startD = new Date(startTime);
    const endD   = new Date(endTime);
    const dateStr = startD.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    const timeStr = `${startD.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })} – ${endD.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`;

    const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com";
    const appointmentsUrl = `${appUrl}/en/appointments`;

    const emailHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden}
  .hdr{background:#0f172a;padding:24px 32px}
  .hdr h1{color:#fff;margin:0;font-size:18px}
  .hdr p{color:#94a3b8;margin:4px 0 0;font-size:13px}
  .bdy{padding:28px 32px}
  .tbl{width:100%;background:#f8fafc;border-radius:8px;border-collapse:collapse;margin:16px 0}
  .tbl td{padding:10px 14px;font-size:14px;color:#374151}
  .tbl td:first-child{color:#6b7280;width:120px;font-weight:600}
  .cta{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px}
  .ftr{padding:16px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#9ca3af}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>${clinicName}</h1><p>New Appointment Scheduled</p></div>
  <div class="bdy">
    <p style="margin-top:0;font-size:15px;color:#111827">A new appointment has been booked.</p>
    <table class="tbl">
      <tr><td>Patient</td><td><strong>${esc(patientName)}</strong></td></tr>
      <tr><td>Provider</td><td>Dr. ${esc(providerName)}</td></tr>
      <tr><td>Service</td><td>${esc(serviceName)}</td></tr>
      <tr><td>Date</td><td>${esc(dateStr)}</td></tr>
      <tr><td>Time</td><td>${esc(timeStr)}</td></tr>
    </table>
    <a href="${appointmentsUrl}" class="cta">View Appointments →</a>
  </div>
  <div class="ftr">Automated message from ${esc(clinicName)} · clinic-os</div>
</div>
</body></html>`;

    // Notify ALL staff + in-app notification
    await notify({
      organizationId,
      type: "new_appointment",
      title: `New appointment: ${patientName}`,
      body: `${patientName} booked with Dr. ${providerName} on ${dateStr} at ${startD.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}`,
      link: `/en/appointments`,
      email: {
        subject: `New appointment: ${patientName} — ${dateStr}`,
        html: emailHtml,
      },
    });

  } catch (e) {
    console.error("[notifyNewAppointment] Error:", e);
  }
}

function esc(t: string): string {
  return String(t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}