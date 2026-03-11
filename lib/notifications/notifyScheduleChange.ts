import { pgClient } from "@/db/index";
import { notify } from "./notify";

export type ScheduleChangePayload = {
  organizationId: string;
  appointmentId: string;
  oldStartTime: Date | string;
  newStartTime: Date | string;
  newEndTime: Date | string;
  changedByUserId?: string;
};

export async function notifyScheduleChange(
  payload: ScheduleChangePayload
): Promise<void> {
  const { organizationId, appointmentId, oldStartTime, newStartTime, newEndTime } = payload;

  try {
    const [details] = await pgClient`
      SELECT
        p.first_name || ' ' || COALESCE(p.last_name, '') AS patient_name,
        COALESCE(u.full_name, 'Provider')                AS provider_name,
        u.id                                             AS provider_user_id,
        org.name                                         AS clinic_name
      FROM appointments a
      JOIN patients          p   ON p.id  = a.patient_id
      LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
      LEFT JOIN users        u   ON u.id  = pp.user_id
      JOIN organizations     org ON org.id = a.organization_id
      WHERE a.id = ${appointmentId}
      LIMIT 1
    `;

    if (!details) return;

    const patientName    = details.patient_name  as string;
    const providerName   = details.provider_name as string;
    const providerUserId = details.provider_user_id as string | undefined;
    const clinicName     = details.clinic_name   as string;

    const oldD    = new Date(oldStartTime);
    const newD    = new Date(newStartTime);
    const newEndD = new Date(newEndTime);

    const fmt = (d: Date) =>
      d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" }) +
      " at " +
      d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });

    const oldStr    = fmt(oldD);
    const newStr    = fmt(newD);
    const newEndStr = newEndD.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
    const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com";

    const emailHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden}
  .hdr{background:#0f172a;padding:24px 32px}
  .hdr h1{color:#fff;margin:0;font-size:18px}
  .hdr p{color:#94a3b8;margin:4px 0 0;font-size:13px}
  .bdy{padding:28px 32px}
  .alert{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:20px}
  .alert p{margin:0;color:#92400e;font-size:14px;font-weight:600}
  .tbl{width:100%;background:#f8fafc;border-radius:8px;border-collapse:collapse;margin:16px 0}
  .tbl td{padding:10px 14px;font-size:14px;color:#374151}
  .tbl td:first-child{color:#6b7280;width:120px;font-weight:600}
  .cta{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px}
  .ftr{padding:16px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#9ca3af}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>${esc(clinicName)}</h1><p>Appointment Rescheduled</p></div>
  <div class="bdy">
    <div class="alert"><p>📅 An appointment has been rescheduled</p></div>
    <table class="tbl">
      <tr><td>Patient</td><td><strong>${esc(patientName)}</strong></td></tr>
      <tr><td>Provider</td><td>Dr. ${esc(providerName)}</td></tr>
      <tr><td>Was</td><td><s style="color:#9ca3af">${esc(oldStr)}</s></td></tr>
      <tr><td>Now</td><td><strong style="color:#15803d">${esc(newStr)} – ${esc(newEndStr)}</strong></td></tr>
    </table>
    <a href="${appUrl}/en/appointments" class="cta">View Appointments →</a>
  </div>
  <div class="ftr">Automated message from ${esc(clinicName)} · clinic-os</div>
</div>
</body></html>`;

    const notificationBody = `${patientName}'s appointment moved from ${oldStr} to ${newStr}`;

    // 1. Notify all admins/managers
    await notify({
      organizationId,
      adminOnly: true,
      type: "schedule_change",
      title: `Rescheduled: ${patientName}`,
      body: notificationBody,
      link: `/en/appointments`,
      email: {
        subject: `Appointment rescheduled: ${patientName} — now ${newStr}`,
        html: emailHtml,
      },
    });

    // 2. Notify the provider specifically (in-app + email)
    if (providerUserId) {
      await notify({
        organizationId,
        userIds: [providerUserId],
        type: "schedule_change",
        title: `Your appointment rescheduled: ${patientName}`,
        body: notificationBody,
        link: `/en/appointments`,
        email: {
          subject: `Your appointment rescheduled: ${patientName} — now ${newStr}`,
          html: emailHtml,
        },
      });
    }

  } catch (e) {
    console.error("[notifyScheduleChange] Error:", e);
  }
}

function esc(t: string): string {
  return String(t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}