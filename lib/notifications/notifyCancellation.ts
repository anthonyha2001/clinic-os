import { pgClient } from "@/db/index";
import { notify } from "./notify";

export type CancellationPayload = {
  organizationId: string;
  appointmentId: string;
  canceledByUserId?: string;
  reason?: string | null;
};

export async function notifyCancellation(
  payload: CancellationPayload
): Promise<void> {
  const { organizationId, appointmentId, reason } = payload;

  try {
    const [details] = await pgClient`
      SELECT
        p.first_name || ' ' || COALESCE(p.last_name, '') AS patient_name,
        COALESCE(u.full_name, 'Provider')                AS provider_name,
        u.id                                             AS provider_user_id,
        a.start_time,
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

    const startD   = new Date(details.start_time as string);
    const dateStr  = startD.toLocaleDateString("en", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
    const timeStr  = startD.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
    const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com";

    const emailHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0}
  .wrap{max-width:560px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden}
  .hdr{background:#0f172a;padding:24px 32px}
  .hdr h1{color:#fff;margin:0;font-size:18px}
  .hdr p{color:#94a3b8;margin:4px 0 0;font-size:13px}
  .bdy{padding:28px 32px}
  .alert{background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin-bottom:20px}
  .alert p{margin:0;color:#b91c1c;font-size:14px;font-weight:600}
  .tbl{width:100%;background:#f8fafc;border-radius:8px;border-collapse:collapse;margin:16px 0}
  .tbl td{padding:10px 14px;font-size:14px;color:#374151}
  .tbl td:first-child{color:#6b7280;width:120px;font-weight:600}
  .cta{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px}
  .ftr{padding:16px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#9ca3af}
</style></head><body>
<div class="wrap">
  <div class="hdr"><h1>${esc(clinicName)}</h1><p>Appointment Canceled</p></div>
  <div class="bdy">
    <div class="alert"><p>❌ An appointment has been canceled</p></div>
    <table class="tbl">
      <tr><td>Patient</td><td><strong>${esc(patientName)}</strong></td></tr>
      <tr><td>Provider</td><td>Dr. ${esc(providerName)}</td></tr>
      <tr><td>Was scheduled</td><td>${esc(dateStr)} at ${esc(timeStr)}</td></tr>
      ${reason ? `<tr><td>Reason</td><td>${esc(reason)}</td></tr>` : ""}
    </table>
    <p style="font-size:14px;color:#374151;margin-bottom:16px">
      This slot is now available for new bookings.
    </p>
    <a href="${appUrl}/en/appointments" class="cta">View Appointments →</a>
  </div>
  <div class="ftr">Automated message from ${esc(clinicName)} · clinic-os</div>
</div>
</body></html>`;

    const notificationBody = `${patientName}'s appointment on ${dateStr} at ${timeStr} was canceled${reason ? ` — ${reason}` : ""}`;

    // 1. Notify all admins/managers
    await notify({
      organizationId,
      adminOnly: true,
      type: "schedule_change",
      title: `Canceled: ${patientName}`,
      body: notificationBody,
      link: `/en/appointments`,
      email: {
        subject: `Appointment canceled: ${patientName} — ${dateStr}`,
        html: emailHtml,
      },
    });

    // 2. Notify the provider specifically
    if (providerUserId) {
      await notify({
        organizationId,
        userIds: [providerUserId],
        type: "schedule_change",
        title: `Your appointment canceled: ${patientName}`,
        body: notificationBody,
        link: `/en/appointments`,
        email: {
          subject: `Your appointment canceled: ${patientName} — ${dateStr}`,
          html: emailHtml,
        },
      });
    }

  } catch (e) {
    console.error("[notifyCancellation] Error:", e);
  }
}

function esc(t: string): string {
  return String(t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}