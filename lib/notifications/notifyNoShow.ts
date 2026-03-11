import { notify } from "./notify";

export type NoShowNotifyPayload = {
  organizationId: string;
  appointmentId: string;
  patientName: string;
  providerName: string;
  providerUserId: string;
  dateStr: string;
  timeStr: string;
  clinicName: string;
  patientId: string;
};

export async function notifyNoShow(payload: NoShowNotifyPayload): Promise<void> {
  const {
    organizationId,
    patientName,
    providerName,
    providerUserId,
    dateStr,
    timeStr,
    clinicName,
    patientId,
  } = payload;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com";

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
  <div class="hdr"><h1>${esc(clinicName)}</h1><p>No-Show Alert</p></div>
  <div class="bdy">
    <div class="alert"><p>⚠️ Patient marked as No-Show</p></div>
    <table class="tbl">
      <tr><td>Patient</td><td><strong>${esc(patientName)}</strong></td></tr>
      <tr><td>Provider</td><td>Dr. ${esc(providerName)}</td></tr>
      <tr><td>Date</td><td>${esc(dateStr)}</td></tr>
      <tr><td>Time</td><td>${esc(timeStr)}</td></tr>
    </table>
    <p style="font-size:14px;color:#374151;margin-bottom:16px">
      Please follow up and reschedule this patient's appointment when appropriate.
    </p>
    <a href="${appUrl}/en/patients/${patientId}" class="cta">View Patient →</a>
  </div>
  <div class="ftr">Automated message from ${esc(clinicName)} · clinic-os</div>
</div>
</body></html>`;

  // Notify admins/managers + the specific provider
  await notify({
    organizationId,
    adminOnly: true,
    type: "no_show",
    title: `No-show: ${patientName}`,
    body: `${patientName} missed their appointment with Dr. ${providerName} on ${dateStr} at ${timeStr}`,
    link: `/en/patients/${patientId}`,
    email: {
      subject: `No-Show: ${patientName} — ${dateStr} · ${clinicName}`,
      html: emailHtml,
    },
  });

  // Also notify the provider specifically (separate in-app only, email already sent above if they're admin/manager too)
  await notify({
    organizationId,
    userIds: [providerUserId],
    type: "no_show",
    title: `No-show: ${patientName}`,
    body: `${patientName} missed their appointment with you on ${dateStr} at ${timeStr}. Please reschedule.`,
    link: `/en/patients/${patientId}`,
    // Email sent via adminOnly batch above if provider is also admin, otherwise send separately
    email: {
      subject: `No-Show: ${patientName} — ${dateStr} · ${clinicName}`,
      html: emailHtml,
    },
  });
}

function esc(t: string): string {
  return String(t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}