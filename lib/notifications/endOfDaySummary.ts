import { pgClient } from "@/db/index";
import { notify } from "@/lib/notifications/notify";

/**
 * Runs once daily (triggered by cron at ~20:00 or end of working day).
 * Generates EOD summary, sends email to admins, creates in-app notification,
 * and stores a downloadable PDF link.
 */
export async function runEndOfDaySummary(orgId?: string): Promise<{ processed: number; errors: number }> {
  const orgs = orgId
    ? [{ id: orgId }]
    : (await pgClient`SELECT id FROM organizations WHERE is_active = true`);

  let processed = 0;
  let errors = 0;

  for (const org of orgs as { id: string }[]) {
    try {
      await generateSummaryForOrg(org.id);
      processed++;
    } catch (e) {
      console.error(`[EOD] Failed for org ${org.id}:`, e);
      errors++;
    }
  }

  return { processed, errors };
}

async function generateSummaryForOrg(orgId: string): Promise<void> {
  const today = new Date();
  const dayStart = new Date(today); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(today); dayEnd.setHours(23, 59, 59, 999);

  const dateLabel = today.toLocaleDateString("en", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // ── Fetch today's appointments ────────────────────────────────────────────
  const appointments = await pgClient`
    SELECT
      a.id,
      a.status,
      a.start_time,
      a.end_time,
      p.first_name || ' ' || COALESCE(p.last_name, '') AS patient_name,
      COALESCE(u.full_name, 'Unknown')                 AS provider_name,
      s.name_en                                        AS service_name,
      COALESCE(inv.total_amount, 0)                    AS invoice_amount,
      inv.status                                       AS invoice_status
    FROM appointments a
    JOIN patients          p   ON p.id  = a.patient_id
    LEFT JOIN provider_profiles pp ON pp.id = a.provider_id
    LEFT JOIN users        u   ON u.id  = pp.user_id
    LEFT JOIN appointment_lines al ON al.appointment_id = a.id
    LEFT JOIN services     s   ON s.id  = al.service_id
    LEFT JOIN invoices     inv ON inv.id = a.invoice_id
    WHERE a.organization_id = ${orgId}
      AND a.start_time >= ${dayStart.toISOString()}
      AND a.start_time <= ${dayEnd.toISOString()}
      AND a.deleted_at IS NULL
    ORDER BY a.start_time ASC
  `;

  const [org] = await pgClient`SELECT name FROM organizations WHERE id = ${orgId}`;
  const clinicName = (org?.name as string) ?? "Clinic";

  // ── Compute stats ─────────────────────────────────────────────────────────
  const total      = appointments.length;
  const completed  = appointments.filter((a) => a.status === "completed").length;
  const noShows    = appointments.filter((a) => a.status === "no_show").length;
  const canceled   = appointments.filter((a) => a.status === "canceled").length;
  const scheduled  = appointments.filter((a) => ["scheduled", "confirmed"].includes(a.status as string)).length;

  const revenue = appointments
    .filter((a) => a.invoice_status === "paid")
    .reduce((sum, a) => sum + Number(a.invoice_amount ?? 0), 0);

  const outstanding = appointments
    .filter((a) => a.invoice_status && a.invoice_status !== "paid" && a.invoice_status !== "void")
    .reduce((sum, a) => sum + Number(a.invoice_amount ?? 0), 0);

  // ── Generate HTML for PDF and email ──────────────────────────────────────
  const apptRows = (appointments as Record<string, unknown>[]).map((a) => {
    const start = new Date(a.start_time as string);
    const timeStr = start.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
    const statusColor: Record<string, string> = {
      completed: "#15803d", no_show: "#b91c1c", canceled: "#6b7280",
      confirmed: "#1d4ed8", scheduled: "#374151",
    };
    const color = statusColor[a.status as string] ?? "#374151";
    return `
      <tr>
        <td style="padding:8px 12px;font-size:13px;color:#374151">${esc(timeStr)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151">${esc(a.patient_name as string)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151">Dr. ${esc(a.provider_name as string)}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151">${esc((a.service_name as string) ?? "—")}</td>
        <td style="padding:8px 12px;font-size:13px;color:${color};font-weight:600;text-transform:capitalize">${esc(String(a.status).replace("_", " "))}</td>
        <td style="padding:8px 12px;font-size:13px;color:#374151;text-align:right">${Number(a.invoice_amount) > 0 ? `$${Number(a.invoice_amount).toFixed(2)}` : "—"}</td>
      </tr>`;
  }).join("");

  const summaryHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:0}
  .wrap{max-width:720px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden}
  .hdr{background:#0f172a;padding:24px 32px;display:flex;justify-content:space-between;align-items:center}
  .hdr h1{color:#fff;margin:0;font-size:20px}
  .hdr p{color:#94a3b8;margin:4px 0 0;font-size:13px}
  .bdy{padding:28px 32px}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px}
  .stat{background:#f8fafc;border-radius:10px;padding:16px;text-align:center;border:1px solid #e2e8f0}
  .stat .num{font-size:28px;font-weight:700;color:#0f172a;line-height:1}
  .stat .lbl{font-size:12px;color:#64748b;margin-top:4px}
  .stat.green .num{color:#15803d}
  .stat.red .num{color:#b91c1c}
  .stat.blue .num{color:#1d4ed8}
  h3{font-size:14px;font-weight:700;color:#0f172a;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  thead tr{background:#f8fafc;border-bottom:2px solid #e2e8f0}
  thead th{padding:10px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
  tbody tr{border-bottom:1px solid #f1f5f9}
  tbody tr:last-child{border-bottom:none}
  .revenue{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;margin-top:24px}
  .revenue .lbl{font-size:13px;color:#166534;font-weight:600}
  .revenue .amt{font-size:22px;font-weight:700;color:#15803d}
  .ftr{padding:16px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#9ca3af;display:flex;justify-content:space-between}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div>
      <h1>${esc(clinicName)}</h1>
      <p>End of Day Summary — ${esc(dateLabel)}</p>
    </div>
  </div>
  <div class="bdy">
    <div class="stats">
      <div class="stat"><div class="num">${total}</div><div class="lbl">Total Appointments</div></div>
      <div class="stat green"><div class="num">${completed}</div><div class="lbl">Completed</div></div>
      <div class="stat red"><div class="num">${noShows}</div><div class="lbl">No-Shows</div></div>
      <div class="stat"><div class="num">${canceled}</div><div class="lbl">Canceled</div></div>
      <div class="stat blue"><div class="num">${scheduled}</div><div class="lbl">Still Scheduled</div></div>
      <div class="stat green"><div class="num">$${revenue.toFixed(2)}</div><div class="lbl">Revenue Collected</div></div>
    </div>

    <h3>Appointment Detail</h3>
    <table>
      <thead>
        <tr>
          <th>Time</th><th>Patient</th><th>Provider</th>
          <th>Service</th><th>Status</th><th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${apptRows || `<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af">No appointments today</td></tr>`}
      </tbody>
    </table>

    <div class="revenue">
      <div>
        <div class="lbl">💰 Revenue Collected Today</div>
        <div style="font-size:12px;color:#4ade80;margin-top:2px">Outstanding: $${outstanding.toFixed(2)}</div>
      </div>
      <div class="amt">$${revenue.toFixed(2)}</div>
    </div>
  </div>
  <div class="ftr">
    <span>Generated by clinic-os</span>
    <span>${esc(dateLabel)}</span>
  </div>
</div>
</body>
</html>`;

  // ── Store the HTML as a downloadable summary in automation_events ─────────
  const summaryPayload = {
    date: today.toISOString().split("T")[0],
    total, completed, no_shows: noShows, canceled, scheduled,
    revenue: revenue.toFixed(2),
    outstanding: outstanding.toFixed(2),
    html: summaryHtml,
    generated_at: new Date().toISOString(),
  };

  await pgClient`
    INSERT INTO automation_events (
      organization_id, event_type, entity_type, entity_id,
      patient_id, payload, status, scheduled_for
    ) VALUES (
      ${orgId},
      'eod_summary',
      'organization',
      ${orgId},
      NULL,
      ${JSON.stringify(summaryPayload)},
      'completed',
      ${new Date().toISOString()}
    )
  `;

  // ── In-app notification + email to admins ─────────────────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://yourapp.com";

  await notify({
    organizationId: orgId,
    adminOnly: true,
    type: "eod_summary",
    title: `End of Day Summary — ${today.toLocaleDateString("en", { month: "short", day: "numeric" })}`,
    body: `${completed} completed · ${noShows} no-shows · $${revenue.toFixed(2)} revenue`,
    link: `/en/reports`,
    email: {
      subject: `EOD Summary: ${dateLabel} — ${clinicName}`,
      html: summaryHtml,
    },
  });
}

function esc(t: string): string {
  return String(t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}